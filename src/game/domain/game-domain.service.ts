import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes, randomInt, randomUUID } from 'crypto';
import { ColorEnum } from '../engine/enums/color.enum';
import Player from '../engine/entities/player.model';
import PlayerHelper from '../engine/helpers/player.helper';
import PiecesHelper from '../engine/helpers/pieces.helper';
import {
  CreateInviteGameInput,
  JoinInviteGameInput,
  MakeMoveOnlineInput,
  QuitGameInput,
  RequestRematchInput,
  RespondRematchInput,
} from '../dto/game.inputs';
import { GameEventType, GameStatus, Move, TimeControlInput } from '../dto/game.types';

export type TimeControlDomain = {
  initialSeconds: number;
  incrementSeconds: number;
};

export type GameDomainEvent = {
  type: GameEventType;
  gameId: string;
  at: Date;
  message?: string;
  playerId?: string;
  targetClientId?: string | null;
  errorCode?: string | null;
  move?: Move;
  graceSeconds?: number;
  timeoutSeconds?: number;
  deadlineAt?: Date;
};

export type GameDomain = {
  id: string;
  code: string | null;
  timeControl: TimeControlDomain;
  status: GameStatus;
  players: [Player, Player];
  hasGameEnded: boolean;
  winner: Player | null;
  reason: Record<string, boolean>;
  createdAt: Date;
  updatedAt: Date;
  clock: {
    remainingSeconds: Record<ColorEnum, number>;
    lastTickMs: number | null;
  };
  rematch: {
    requestedBy: Set<string>;
    acceptedBy: Set<string>;
  };
  ready: {
    requiredClientIds: Set<string>;
    readyClientIds: Set<string>;
    deadlineMs: number | null;
    failed: boolean;
  };
  disconnect: Map<string, { deadlineMs: number }>;
};

@Injectable()
export class GameDomainService {
  private readonly games = new Map<string, GameDomain>();
  private readonly codeToGameId = new Map<string, string>();

  isClientInGame(gameId: string, clientId: string): boolean {
    const game = this.games.get(gameId);
    if (!game) return false;
    return game.players.some((p) => p.id === clientId);
  }

  findActiveGameByClientId(clientId: string): GameDomain | null {
    for (const game of this.games.values()) {
      if (game.hasGameEnded) continue;
      if (game.status !== GameStatus.IN_PROGRESS) continue;
      if (game.players.some((p) => p.id === clientId)) return game;
    }
    return null;
  }

  getGame(gameId: string): GameDomain | null {
    return this.games.get(gameId) ?? null;
  }

  createInviteGame(input: CreateInviteGameInput): { game: GameDomain; playerColor: ColorEnum; events: GameDomainEvent[] } {
    const timeControl = this.normalizeTimeControl(input.timeControl);
    const { game, playerColor } = this.createGameDomain({
      code: this.generateUniqueInviteCode(),
      white: { clientId: input.clientId, name: input.name ?? 'Player 1' },
      black: { clientId: 'OPEN', name: 'Waiting for player' },
      timeControl,
      status: GameStatus.WAITING_FOR_PLAYERS,
    });

    this.games.set(game.id, game);
    this.codeToGameId.set(game.code as string, game.id);

    return {
      game,
      playerColor,
      events: [
        {
          type: GameEventType.PLAYER_JOINED,
          gameId: game.id,
          at: new Date(),
          playerId: input.clientId,
        },
      ],
    };
  }

  joinInviteGame(args: {
    input: JoinInviteGameInput;
    readyTimeoutSeconds: number;
  }): { game: GameDomain; playerColor: ColorEnum; events: GameDomainEvent[] } {
    const { input, readyTimeoutSeconds } = args;
    const code = input.code.trim().toUpperCase();
    const gameId = this.codeToGameId.get(code);
    if (!gameId) throw new NotFoundException('Game not found');

    const game = this.games.get(gameId);
    if (!game) throw new NotFoundException('Game not found');
    if (game.status === GameStatus.ENDED) throw new BadRequestException('Game already ended');

    const existing = game.players.find((p) => p.id === input.clientId);
    if (existing) {
      return { game, playerColor: existing.color as ColorEnum, events: [] };
    }

    const openSlot = game.players.find((p) => p.id === 'OPEN');
    if (!openSlot) throw new BadRequestException('Game is full');

    openSlot.id = input.clientId;
    openSlot.name = input.name ?? 'Player 2';

    const nowMs = Date.now();
    const deadlineMs = nowMs + readyTimeoutSeconds * 1000;

    game.status = GameStatus.READY_CHECK;
    game.updatedAt = new Date(nowMs);
    game.clock.lastTickMs = null;
    game.clock.remainingSeconds = {
      [ColorEnum.WHITE]: game.timeControl.initialSeconds,
      [ColorEnum.BLACK]: game.timeControl.initialSeconds,
    };
    this.syncClockIntoPlayers(game);

    game.ready.requiredClientIds = new Set(game.players.map((p) => p.id).filter((id) => id !== 'OPEN'));
    game.ready.readyClientIds = new Set();
    game.ready.deadlineMs = deadlineMs;
    game.ready.failed = false;

    const required = [...game.ready.requiredClientIds];

    return {
      game,
      playerColor: openSlot.color as ColorEnum,
      events: [
        {
          type: GameEventType.PLAYER_JOINED,
          gameId: game.id,
          at: game.updatedAt,
          playerId: input.clientId,
        },
        ...required.map((clientId) => ({
          type: GameEventType.GAME_LOAD_REQUEST,
          gameId: game.id,
          at: game.updatedAt,
          targetClientId: clientId,
          timeoutSeconds: readyTimeoutSeconds,
          deadlineAt: new Date(deadlineMs),
          message: 'Load game and send clientReady',
        })),
      ],
    };
  }

  getGameSession(gameId: string, clientId: string): { game: GameDomain; playerColor: ColorEnum } {
    const game = this.games.get(gameId);
    if (!game) throw new NotFoundException('Game not found');
    const player = game.players.find((p) => p.id === clientId);
    if (!player) throw new BadRequestException('Not a player of this game');

    if (game.status === GameStatus.IN_PROGRESS && !game.hasGameEnded) {
      this.applyClockDelta(game, Date.now());
    }

    return { game, playerColor: player.color as ColorEnum };
  }

  clientReady(args: {
    gameId: string;
    clientId: string;
  }): { ok: boolean; game: GameDomain; started: boolean; events: GameDomainEvent[] } {
    const game = this.games.get(args.gameId);
    if (!game) throw new NotFoundException('Game not found');
    const player = game.players.find((p) => p.id === args.clientId);
    if (!player) throw new BadRequestException('Not a player of this game');
    if (game.status !== GameStatus.READY_CHECK) {
      return { ok: true, game, started: game.status === GameStatus.IN_PROGRESS, events: [] };
    }
    if (game.ready.failed) {
      return {
        ok: false,
        game,
        started: false,
        events: [
          {
            type: GameEventType.ERROR,
            gameId: game.id,
            at: new Date(),
            targetClientId: args.clientId,
            errorCode: 'READY_TIMEOUT',
            message: 'Ready check timed out; game did not start.',
          },
        ],
      };
    }

    game.ready.readyClientIds.add(args.clientId);

    const required = [...game.ready.requiredClientIds];
    const allReady = required.length > 0 && required.every((id) => game.ready.readyClientIds.has(id));
    if (!allReady) return { ok: true, game, started: false, events: [] };

    const nowMs = Date.now();
    game.status = GameStatus.IN_PROGRESS;
    game.updatedAt = new Date(nowMs);
    game.clock.lastTickMs = nowMs;
    this.syncClockIntoPlayers(game);

    return {
      ok: true,
      game,
      started: true,
      events: [
        {
          type: GameEventType.GAME_STARTED,
          gameId: game.id,
          at: game.updatedAt,
          message: 'Game started',
        },
      ],
    };
  }

  readyTimeout(args: { gameId: string }): { game: GameDomain; events: GameDomainEvent[] } {
    const game = this.games.get(args.gameId);
    if (!game) throw new NotFoundException('Game not found');
    if (game.status !== GameStatus.READY_CHECK) return { game, events: [] };
    if (game.ready.failed) return { game, events: [] };

    game.ready.failed = true;
    game.updatedAt = new Date();
    const targets = [...game.ready.requiredClientIds];

    return {
      game,
      events: targets.map((clientId) => ({
        type: GameEventType.ERROR,
        gameId: game.id,
        at: new Date(),
        targetClientId: clientId,
        errorCode: 'READY_TIMEOUT',
        message: 'A player did not confirm ready in time; game will not start.',
      })),
    };
  }

  makeMoveOnline(input: MakeMoveOnlineInput): { game: GameDomain; events: GameDomainEvent[] } {
    const game = this.games.get(input.gameId);
    if (!game) throw new NotFoundException('Game not found');
    if (game.status !== GameStatus.IN_PROGRESS) throw new BadRequestException('Game not started');
    if (game.hasGameEnded) throw new BadRequestException('Game ended');

    this.applyClockDelta(game, Date.now());
    if (game.hasGameEnded) throw new BadRequestException('Game ended');

    const player = game.players.find((p) => p.id === input.clientId);
    if (!player) throw new BadRequestException('Player not in game');

    const playingPlayer = PlayerHelper.getPlayingPlayer(game.players);
    const notPlayingPlayer = PlayerHelper.getNotPlayingPlayer(game.players);

    if (player.color !== playingPlayer.color) {
      throw new BadRequestException('Not your turn');
    }

    const allPieces = PlayerHelper.getAllPieces(game.players);
    const selectedPiece = allPieces.find(
      (p) => p.position.vertical === input.from.vertical && p.position.horizontal === input.from.horizontal,
    );
    if (!selectedPiece) throw new BadRequestException('No piece at from');
    if (selectedPiece.color !== playingPlayer.color) throw new BadRequestException('Cannot move opponent piece');

    const to = { vertical: input.to.vertical, horizontal: input.to.horizontal };
    const isPossibleMove = selectedPiece
      .getFilteredMovements(playingPlayer.pieces, notPlayingPlayer.pieces)
      .some((m) => m.vertical === to.vertical && m.horizontal === to.horizontal);
    if (!isPossibleMove) throw new BadRequestException('Illegal move');

    const pieceAtDestination = allPieces.find(
      (p) => p.position.vertical === to.vertical && p.position.horizontal === to.horizontal,
    );

    const afterMovement = selectedPiece.move(to, pieceAtDestination ?? undefined);
    if (afterMovement.hasEaten && afterMovement.ate) {
      PlayerHelper.eatPiece(playingPlayer, notPlayingPlayer, afterMovement.ate);
    }

    if (afterMovement?.castle) {
      PiecesHelper.moveRookForCastle(playingPlayer, selectedPiece, afterMovement.castle);
    }

    if (afterMovement?.enPassant) {
      PiecesHelper.eatEnPassant(selectedPiece, playingPlayer, notPlayingPlayer);
    }

    if (selectedPiece.name === 'Pawn') {
      if (selectedPiece.color === ColorEnum.WHITE && to.vertical === 7) {
        PiecesHelper.pawnPromotion(selectedPiece, to, playingPlayer);
      }
      if (selectedPiece.color === ColorEnum.BLACK && to.vertical === 0) {
        PiecesHelper.pawnPromotion(selectedPiece, to, playingPlayer);
      }
    }

    const movedColor = playingPlayer.color as ColorEnum;
    if (game.timeControl.incrementSeconds > 0) {
      game.clock.remainingSeconds[movedColor] += game.timeControl.incrementSeconds;
    }

    if (PlayerHelper.cantPlay(notPlayingPlayer, playingPlayer.pieces)) {
      if (PiecesHelper.isKingInCheck(notPlayingPlayer.pieces, playingPlayer.pieces)) {
        game.hasGameEnded = true;
        game.winner = playingPlayer;
        game.reason = { checkmate: true };
        game.status = GameStatus.ENDED;
      } else {
        game.hasGameEnded = true;
        game.winner = null;
        game.reason = { stalemate: true };
        game.status = GameStatus.ENDED;
      }
    }

    PlayerHelper.switchPlayerTurn(game.players);
    game.clock.lastTickMs = Date.now();
    game.updatedAt = new Date();
    this.syncClockIntoPlayers(game);
    game.disconnect.clear();
    game.ready.deadlineMs = null;

    const move: Move = {
      from: { vertical: input.from.vertical, horizontal: input.from.horizontal },
      to: { vertical: input.to.vertical, horizontal: input.to.horizontal },
      promotion: input.promotion,
      byPlayerId: input.clientId,
      playedAt: new Date(),
    };

    const events: GameDomainEvent[] = [
      {
        type: GameEventType.MOVE_PLAYED,
        gameId: game.id,
        at: new Date(),
        move,
      },
    ];

    if (game.status === GameStatus.ENDED) {
      events.push({
        type: GameEventType.GAME_ENDED,
        gameId: game.id,
        at: new Date(),
        message: 'Game ended',
      });
    }

    return { game, events };
  }

  requestRematch(input: RequestRematchInput): { ok: boolean; game: GameDomain; events: GameDomainEvent[] } {
    const game = this.games.get(input.gameId);
    if (!game) throw new NotFoundException('Game not found');
    if (!game.hasGameEnded) throw new BadRequestException('Game not ended');

    const player = game.players.find((p) => p.id === input.clientId);
    if (!player) throw new BadRequestException('Player not in game');

    game.rematch.requestedBy.add(input.clientId);
    return {
      ok: true,
      game,
      events: [
        {
          type: GameEventType.REMATCH_REQUESTED,
          gameId: game.id,
          at: new Date(),
          playerId: input.clientId,
        },
      ],
    };
  }

  respondRematch(args: {
    input: RespondRematchInput;
    readyTimeoutSeconds: number;
  }): { ok: boolean; game: GameDomain; events: GameDomainEvent[]; readyCheckStarted: boolean } {
    const { input, readyTimeoutSeconds } = args;
    const game = this.games.get(input.gameId);
    if (!game) throw new NotFoundException('Game not found');
    if (!game.hasGameEnded) throw new BadRequestException('Game not ended');

    const player = game.players.find((p) => p.id === input.clientId);
    if (!player) throw new BadRequestException('Player not in game');

    if (!input.accept) {
      game.rematch.requestedBy.clear();
      game.rematch.acceptedBy.clear();
      return {
        ok: true,
        game,
        readyCheckStarted: false,
        events: [
          {
            type: GameEventType.REMATCH_DECLINED,
            gameId: game.id,
            at: new Date(),
            playerId: input.clientId,
          },
        ],
      };
    }

    game.rematch.requestedBy.add(input.clientId);
    game.rematch.acceptedBy.add(input.clientId);

    const events: GameDomainEvent[] = [
      {
        type: GameEventType.REMATCH_ACCEPTED,
        gameId: game.id,
        at: new Date(),
        playerId: input.clientId,
      },
    ];

    const allPlayers = game.players.filter((p) => p.id !== 'OPEN');
    const bothAccepted = allPlayers.length === 2 && allPlayers.every((p) => game.rematch.acceptedBy.has(p.id));

    if (!bothAccepted) return { ok: true, game, events, readyCheckStarted: false };

    const nowMs = Date.now();
    const deadlineMs = nowMs + readyTimeoutSeconds * 1000;

    this.startRematchReadyCheck(game, nowMs);

    game.ready.requiredClientIds = new Set(allPlayers.map((p) => p.id));
    game.ready.readyClientIds = new Set();
    game.ready.deadlineMs = deadlineMs;
    game.ready.failed = false;

    events.push({
      type: GameEventType.REMATCH_STARTED,
      gameId: game.id,
      at: new Date(nowMs),
      message: 'Rematch prepared (colors swapped); waiting for ready',
    });

    for (const clientId of [...game.ready.requiredClientIds]) {
      events.push({
        type: GameEventType.GAME_LOAD_REQUEST,
        gameId: game.id,
        at: new Date(nowMs),
        targetClientId: clientId,
        timeoutSeconds: readyTimeoutSeconds,
        deadlineAt: new Date(deadlineMs),
        message: 'Load rematch and send clientReady',
      });
    }

    return { ok: true, game, events, readyCheckStarted: true };
  }

  quitGame(args: { input: QuitGameInput; graceSeconds: number }): { ok: boolean; game: GameDomain | null; events: GameDomainEvent[] } {
    const { input, graceSeconds } = args;
    const game = this.games.get(input.gameId);
    if (!game) return { ok: true, game: null, events: [] };
    const quitter = game.players.find((p) => p.id === input.clientId);
    if (!quitter) return { ok: true, game, events: [] };

    if (game.status === GameStatus.WAITING_FOR_PLAYERS) {
      if (game.code) this.codeToGameId.delete(game.code);
      this.games.delete(game.id);
      return { ok: true, game: null, events: [] };
    }

    const { events } = this.startDisconnectGrace({
      gameId: game.id,
      clientId: input.clientId,
      graceSeconds,
      label: 'Quit',
    });
    return { ok: true, game, events };
  }

  startDisconnectGrace(args: {
    gameId: string;
    clientId: string;
    graceSeconds: number;
    label: string;
  }): { game: GameDomain; deadlineMs: number; events: GameDomainEvent[] } {
    const game = this.games.get(args.gameId);
    if (!game) throw new NotFoundException('Game not found');
    if (game.status !== GameStatus.IN_PROGRESS || game.hasGameEnded) return { game, deadlineMs: 0, events: [] };
    const player = game.players.find((p) => p.id === args.clientId);
    if (!player) throw new BadRequestException('Player not in game');
    if (game.disconnect.has(args.clientId)) return { game, deadlineMs: game.disconnect.get(args.clientId)!.deadlineMs, events: [] };

    const nowMs = Date.now();
    const deadlineMs = nowMs + args.graceSeconds * 1000;
    game.disconnect.set(args.clientId, { deadlineMs });
    game.updatedAt = new Date(nowMs);

    return {
      game,
      deadlineMs,
      events: [
        {
          type: GameEventType.PLAYER_DISCONNECTED,
          gameId: game.id,
          at: new Date(nowMs),
          playerId: args.clientId,
          message: `${args.label} (grace started)`,
          graceSeconds: args.graceSeconds,
          deadlineAt: new Date(deadlineMs),
        },
      ],
    };
  }

  cancelDisconnectGrace(clientId: string): { game: GameDomain | null; events: GameDomainEvent[] } {
    const game = this.findActiveGameByClientId(clientId);
    if (!game) return { game: null, events: [] };
    const pending = game.disconnect.get(clientId);
    if (!pending) return { game, events: [] };

    game.disconnect.delete(clientId);
    game.updatedAt = new Date();
    return {
      game,
      events: [
        {
          type: GameEventType.PLAYER_RECONNECTED,
          gameId: game.id,
          at: new Date(),
          playerId: clientId,
          message: 'Player reconnected',
        },
      ],
    };
  }

  expireDisconnect(args: { gameId: string; clientId: string }): { game: GameDomain; events: GameDomainEvent[] } {
    const game = this.games.get(args.gameId);
    if (!game) throw new NotFoundException('Game not found');
    if (game.hasGameEnded) return { game, events: [] };
    const pending = game.disconnect.get(args.clientId);
    if (!pending) return { game, events: [] };

    const opponent = game.players.find((p) => p.id !== args.clientId && p.id !== 'OPEN') ?? null;
    game.hasGameEnded = true;
    game.status = GameStatus.ENDED;
    game.reason = { resign: true, opponentQuit: true };
    game.winner = opponent;
    game.updatedAt = new Date();
    game.disconnect.delete(args.clientId);
    game.ready.failed = true;

    return {
      game,
      events: [
        {
          type: GameEventType.GAME_ENDED,
          gameId: game.id,
          at: new Date(),
          message: 'Disconnected resigned',
        },
      ],
    };
  }

  tick(nowMs: number): { events: GameDomainEvent[] } {
    const events: GameDomainEvent[] = [];
    for (const game of this.games.values()) {
      if (game.status !== GameStatus.IN_PROGRESS || game.hasGameEnded) continue;
      const { changed, ended } = this.applyClockDelta(game, nowMs);
      if (changed) {
        events.push({
          type: GameEventType.CLOCK_TICK,
          gameId: game.id,
          at: new Date(nowMs),
        });
      }
      if (ended) {
        events.push({
          type: GameEventType.GAME_ENDED,
          gameId: game.id,
          at: new Date(nowMs),
          message: 'Timeout',
        });
      }
    }
    return { events };
  }

  createMatchGame(args: {
    white: { clientId: string; name: string };
    black: { clientId: string; name: string };
    timeControl: TimeControlDomain;
    readyTimeoutSeconds: number;
  }): { game: GameDomain; events: GameDomainEvent[] } {
    const { game } = this.createGameDomain({
      code: null,
      white: args.white,
      black: args.black,
      timeControl: args.timeControl,
      status: GameStatus.READY_CHECK,
    });

    const nowMs = Date.now();
    const deadlineMs = nowMs + args.readyTimeoutSeconds * 1000;
    game.ready.requiredClientIds = new Set([args.white.clientId, args.black.clientId]);
    game.ready.readyClientIds = new Set();
    game.ready.deadlineMs = deadlineMs;
    game.ready.failed = false;

    this.games.set(game.id, game);

    const events: GameDomainEvent[] = [];
    for (const clientId of [...game.ready.requiredClientIds]) {
      events.push({
        type: GameEventType.GAME_LOAD_REQUEST,
        gameId: game.id,
        at: new Date(nowMs),
        targetClientId: clientId,
        timeoutSeconds: args.readyTimeoutSeconds,
        deadlineAt: new Date(deadlineMs),
        message: 'Load matched game and send clientReady',
      });
    }

    return { game, events };
  }

  private startRematchReadyCheck(game: GameDomain, nowMs: number) {
    const oldPlayers = game.players.filter((p) => p.id !== 'OPEN');
    if (oldPlayers.length !== 2) return;

    const pWhite = oldPlayers.find((p) => p.color === ColorEnum.WHITE) as Player;
    const pBlack = oldPlayers.find((p) => p.color === ColorEnum.BLACK) as Player;

    const newWhite = new Player(pBlack.id, pBlack.name, ColorEnum.WHITE, true, game.timeControl.initialSeconds);
    const newBlack = new Player(pWhite.id, pWhite.name, ColorEnum.BLACK, false, game.timeControl.initialSeconds);

    game.players = [newWhite, newBlack];
    game.status = GameStatus.READY_CHECK;
    game.hasGameEnded = false;
    game.winner = null;
    game.reason = {};
    game.updatedAt = new Date(nowMs);
    game.clock.remainingSeconds = {
      [ColorEnum.WHITE]: game.timeControl.initialSeconds,
      [ColorEnum.BLACK]: game.timeControl.initialSeconds,
    };
    game.clock.lastTickMs = null;
    game.rematch.requestedBy.clear();
    game.rematch.acceptedBy.clear();
    game.disconnect.clear();
    this.syncClockIntoPlayers(game);
  }

  private generateUniqueInviteCode(): string {
    for (let attempt = 0; attempt < 50; attempt++) {
      const code = this.generateInviteCode();
      if (!this.codeToGameId.has(code)) return code;
    }
    throw new Error('Failed to generate unique invite code');
  }

  private generateInviteCode(): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const bytes = randomBytes(7);
    let out = '';
    for (const b of bytes) out += alphabet[b % alphabet.length];
    return out;
  }

  private normalizeTimeControl(input: TimeControlInput): TimeControlDomain {
    const initialSeconds = Math.max(1, Math.floor(input.initialSeconds));
    const incrementSeconds = input.incrementSeconds ? Math.max(0, Math.floor(input.incrementSeconds)) : 0;
    return { initialSeconds, incrementSeconds };
  }

  private createGameDomain(args: {
    code: string | null;
    white: { clientId: string; name: string };
    black: { clientId: string; name: string };
    timeControl: TimeControlDomain;
    status: GameStatus;
  }): { game: GameDomain; playerColor: ColorEnum } {
    const id = randomUUID();
    const now = new Date();

    const white = new Player(args.white.clientId, args.white.name, ColorEnum.WHITE, true, args.timeControl.initialSeconds);
    const black = new Player(args.black.clientId, args.black.name, ColorEnum.BLACK, false, args.timeControl.initialSeconds);

    const game: GameDomain = {
      id,
      code: args.code,
      timeControl: args.timeControl,
      status: args.status,
      players: [white, black],
      hasGameEnded: false,
      winner: null,
      reason: {},
      createdAt: now,
      updatedAt: now,
      clock: {
        remainingSeconds: {
          [ColorEnum.WHITE]: args.timeControl.initialSeconds,
          [ColorEnum.BLACK]: args.timeControl.initialSeconds,
        },
        lastTickMs: null,
      },
      rematch: {
        requestedBy: new Set<string>(),
        acceptedBy: new Set<string>(),
      },
      ready: {
        requiredClientIds: new Set(),
        readyClientIds: new Set(),
        deadlineMs: null,
        failed: false,
      },
      disconnect: new Map(),
    };

    return { game, playerColor: ColorEnum.WHITE };
  }

  private applyClockDelta(game: GameDomain, nowMs: number): { changed: boolean; ended: boolean } {
    if (game.status !== GameStatus.IN_PROGRESS || game.hasGameEnded) return { changed: false, ended: false };
    if (!game.clock.lastTickMs) {
      game.clock.lastTickMs = nowMs;
      return { changed: false, ended: false };
    }

    const elapsedSeconds = Math.floor((nowMs - game.clock.lastTickMs) / 1000);
    if (elapsedSeconds <= 0) return { changed: false, ended: false };

    const playingPlayer = PlayerHelper.getPlayingPlayer(game.players);
    const color = playingPlayer.color as ColorEnum;
    game.clock.remainingSeconds[color] = Math.max(0, game.clock.remainingSeconds[color] - elapsedSeconds);
    game.clock.lastTickMs += elapsedSeconds * 1000;
    this.syncClockIntoPlayers(game);

    if (game.clock.remainingSeconds[color] <= 0) {
      const opponent = game.players.find((p) => p.color !== color) as Player;
      game.hasGameEnded = true;
      game.status = GameStatus.ENDED;
      game.reason = { timeout: true };
      game.winner = opponent ?? null;
      game.disconnect.clear();
      return { changed: true, ended: true };
    }

    return { changed: true, ended: false };
  }

  private syncClockIntoPlayers(game: GameDomain) {
    game.players.forEach((p) => {
      p.time = game.clock.remainingSeconds[p.color as ColorEnum] ?? p.time;
    });
  }
}

