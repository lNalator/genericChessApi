import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { randomBytes, randomInt, randomUUID } from 'crypto';
import { PubSub } from 'graphql-subscriptions';
import {
  CreateInviteGameInput,
  DequeueMatchmakingInput,
  EnqueueMatchmakingInput,
  JoinInviteGameInput,
  MakeMoveOnlineInput,
  QuitGameInput,
  RequestRematchInput,
  RespondRematchInput,
} from './dto/game.inputs';
import {
  Game,
  GameEvent,
  GameEventType,
  GameSession,
  GameStatus,
  MatchmakingEvent,
  MatchmakingEventType,
  Move,
  TimeControl,
  TimeControlInput,
} from './dto/game.types';
import { ColorEnum } from './engine/enums/color.enum';
import Player from './engine/entities/player.model';
import PlayerHelper from './engine/helpers/player.helper';
import PiecesHelper from './engine/helpers/pieces.helper';

export const GAME_EVENTS_TOPIC = 'GAME_EVENTS_TOPIC';

function matchmakingTopic(clientId: string) {
  return `MATCHMAKING_${clientId}`;
}

type TimeControlDomain = {
  initialSeconds: number;
  incrementSeconds: number;
};

type GameDomain = {
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
};

type MatchmakingEntry = {
  clientId: string;
  name?: string;
  timeControl: TimeControlDomain;
  enqueuedAt: number;
};

@Injectable()
export class GameService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GameService.name);
  private readonly games = new Map<string, GameDomain>();
  private readonly codeToGameId = new Map<string, string>();
  private readonly queue: MatchmakingEntry[] = [];
  private tickInterval: NodeJS.Timeout | null = null;

  constructor(private readonly pubSub: PubSub) {}

  onModuleInit() {
    this.tickInterval = setInterval(() => {
      const nowMs = Date.now();
      for (const game of this.games.values()) {
        if (game.status !== GameStatus.IN_PROGRESS || game.hasGameEnded) continue;
        const changed = this.applyClockDelta(game, nowMs);
        if (changed) {
          const gql = this.toGraphQL(game);
          this.publishGameEvent({
            type: GameEventType.CLOCK_TICK,
            gameId: game.id,
            at: new Date(nowMs),
            game: gql,
          });
        }
      }
    }, 1000);
  }

  onModuleDestroy() {
    if (this.tickInterval) clearInterval(this.tickInterval);
    this.tickInterval = null;
  }

  createInviteGame(input: CreateInviteGameInput): GameSession {
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

    const gql = this.toGraphQL(game);
    this.logger.log(`createInviteGame code=${game.code} gameId=${game.id} clientId=${input.clientId}`);
    this.publishGameEvent({
      type: GameEventType.PLAYER_JOINED,
      gameId: game.id,
      at: new Date(),
      game: gql,
      player: gql.players.find((p) => p.id === input.clientId),
    });

    return {
      gameId: game.id,
      code: game.code,
      playerColor,
      game: gql,
    };
  }

  joinInviteGame(input: JoinInviteGameInput): GameSession {
    const code = input.code.trim().toUpperCase();
    const gameId = this.codeToGameId.get(code);
    if (!gameId) throw new NotFoundException('Game not found');

    const game = this.games.get(gameId);
    if (!game) throw new NotFoundException('Game not found');
    if (game.status === GameStatus.ENDED) throw new BadRequestException('Game already ended');

    const existing = game.players.find((p) => p.id === input.clientId);
    if (existing) {
      return {
        gameId: game.id,
        code: game.code,
        playerColor: existing.color as ColorEnum,
        game: this.toGraphQL(game),
      };
    }

    const openSlot = game.players.find((p) => p.id === 'OPEN');
    if (!openSlot) throw new BadRequestException('Game is full');

    openSlot.id = input.clientId;
    openSlot.name = input.name ?? 'Player 2';

    game.status = GameStatus.IN_PROGRESS;
    game.updatedAt = new Date();
    game.clock.lastTickMs = Date.now();
    this.syncClockIntoPlayers(game);

    const gql = this.toGraphQL(game);
    this.logger.log(`joinInviteGame code=${code} gameId=${game.id} clientId=${input.clientId}`);
    this.publishGameEvent({
      type: GameEventType.PLAYER_JOINED,
      gameId: game.id,
      at: game.updatedAt,
      game: gql,
      player: gql.players.find((p) => p.id === input.clientId),
    });
    this.publishGameEvent({
      type: GameEventType.GAME_STARTED,
      gameId: game.id,
      at: game.updatedAt,
      game: gql,
    });

    return {
      gameId: game.id,
      code: game.code,
      playerColor: openSlot.color as ColorEnum,
      game: gql,
    };
  }

  getGameSession(gameId: string, clientId: string): GameSession {
    const game = this.games.get(gameId);
    if (!game) throw new NotFoundException('Game not found');
    const player = game.players.find((p) => p.id === clientId);
    if (!player) throw new BadRequestException('Not a player of this game');

    if (game.status === GameStatus.IN_PROGRESS && !game.hasGameEnded) {
      this.applyClockDelta(game, Date.now());
    }

    return {
      gameId: game.id,
      code: game.code,
      playerColor: player.color as ColorEnum,
      game: this.toGraphQL(game),
    };
  }

  enqueueMatchmaking(input: EnqueueMatchmakingInput): { enqueued: boolean } {
    const timeControl = this.normalizeTimeControl(input.timeControl);

    const alreadyQueued = this.queue.some((e) => e.clientId === input.clientId);
    if (alreadyQueued) return { enqueued: true };

    const opponentIndex = this.queue.findIndex(
      (e) => e.clientId !== input.clientId && this.timeControlKey(e.timeControl) === this.timeControlKey(timeControl),
    );

    if (opponentIndex !== -1) {
      const opponent = this.queue.splice(opponentIndex, 1)[0];
      this.createMatchFromQueue(opponent, {
        clientId: input.clientId,
        name: input.name,
        timeControl,
        enqueuedAt: Date.now(),
      });
      return { enqueued: false };
    }

    this.queue.push({
      clientId: input.clientId,
      name: input.name,
      timeControl,
      enqueuedAt: Date.now(),
    });

    this.publishMatchmakingEvent({
      type: MatchmakingEventType.ENQUEUED,
      at: new Date(),
      clientId: input.clientId,
      message: 'Enqueued',
    });

    return { enqueued: true };
  }

  dequeueMatchmaking(input: DequeueMatchmakingInput): { dequeued: boolean } {
    const idx = this.queue.findIndex((e) => e.clientId === input.clientId);
    if (idx === -1) return { dequeued: false };
    this.queue.splice(idx, 1);

    this.publishMatchmakingEvent({
      type: MatchmakingEventType.DEQUEUED,
      at: new Date(),
      clientId: input.clientId,
      message: 'Dequeued',
    });

    return { dequeued: true };
  }

  makeMoveOnline(input: MakeMoveOnlineInput): Game {
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

    const gql = this.toGraphQL(game);
    const move: Move = {
      from: { vertical: input.from.vertical, horizontal: input.from.horizontal },
      to: { vertical: input.to.vertical, horizontal: input.to.horizontal },
      promotion: input.promotion,
      byPlayerId: input.clientId,
      playedAt: new Date(),
    };

    this.publishGameEvent({
      type: GameEventType.MOVE_PLAYED,
      gameId: game.id,
      at: new Date(),
      game: gql,
      move,
    });

    if (game.status === GameStatus.ENDED) {
      this.publishGameEvent({
        type: GameEventType.GAME_ENDED,
        gameId: game.id,
        at: new Date(),
        game: gql,
      });
    }

    return gql;
  }

  requestRematch(input: RequestRematchInput): { ok: boolean } {
    const game = this.games.get(input.gameId);
    if (!game) throw new NotFoundException('Game not found');
    if (!game.hasGameEnded) throw new BadRequestException('Game not ended');

    const player = game.players.find((p) => p.id === input.clientId);
    if (!player) throw new BadRequestException('Player not in game');

    game.rematch.requestedBy.add(input.clientId);

    const gql = this.toGraphQL(game);
    this.publishGameEvent({
      type: GameEventType.REMATCH_REQUESTED,
      gameId: game.id,
      at: new Date(),
      game: gql,
      player: gql.players.find((p) => p.id === input.clientId),
    });
    return { ok: true };
  }

  respondRematch(input: RespondRematchInput): { ok: boolean } {
    const game = this.games.get(input.gameId);
    if (!game) throw new NotFoundException('Game not found');
    if (!game.hasGameEnded) throw new BadRequestException('Game not ended');

    const player = game.players.find((p) => p.id === input.clientId);
    if (!player) throw new BadRequestException('Player not in game');

    if (!input.accept) {
      game.rematch.requestedBy.clear();
      game.rematch.acceptedBy.clear();
      const gql = this.toGraphQL(game);
      this.publishGameEvent({
        type: GameEventType.REMATCH_DECLINED,
        gameId: game.id,
        at: new Date(),
        game: gql,
        player: gql.players.find((p) => p.id === input.clientId),
      });
      return { ok: true };
    }

    game.rematch.requestedBy.add(input.clientId);
    game.rematch.acceptedBy.add(input.clientId);

    const gql = this.toGraphQL(game);
    this.publishGameEvent({
      type: GameEventType.REMATCH_ACCEPTED,
      gameId: game.id,
      at: new Date(),
      game: gql,
      player: gql.players.find((p) => p.id === input.clientId),
    });

    const allPlayers = game.players.filter((p) => p.id !== 'OPEN');
    const bothAccepted = allPlayers.length === 2 && allPlayers.every((p) => game.rematch.acceptedBy.has(p.id));

    if (bothAccepted) {
      this.startRematch(game);
    }

    return { ok: true };
  }

  quitGame(input: QuitGameInput): { ok: boolean } {
    const game = this.games.get(input.gameId);
    if (!game) return { ok: true };
    const quitter = game.players.find((p) => p.id === input.clientId);
    if (!quitter) return { ok: true };

    const now = new Date();

    if (game.status === GameStatus.WAITING_FOR_PLAYERS) {
      if (game.code) this.codeToGameId.delete(game.code);
      this.games.delete(game.id);
      this.publishGameEvent({
        type: GameEventType.PLAYER_QUIT,
        gameId: game.id,
        at: now,
        game: this.toGraphQL(game),
        player: { ...(quitter as any) },
        message: 'Host quit',
      });
      return { ok: true };
    }

    if (!game.hasGameEnded) {
      const opponent = game.players.find((p) => p.id !== input.clientId && p.id !== 'OPEN');
      game.hasGameEnded = true;
      game.status = GameStatus.ENDED;
      game.reason = { opponentQuit: true };
      game.winner = opponent ?? null;
      game.updatedAt = now;
    }

    const gql = this.toGraphQL(game);
    this.publishGameEvent({
      type: GameEventType.PLAYER_QUIT,
      gameId: game.id,
      at: now,
      game: gql,
      player: gql.players.find((p) => p.id === input.clientId),
      message: 'Player quit',
    });
    this.publishGameEvent({
      type: GameEventType.GAME_ENDED,
      gameId: game.id,
      at: now,
      game: gql,
    });

    return { ok: true };
  }

  asyncIteratorGameEvents() {
    return (this.pubSub as any).asyncIterator(GAME_EVENTS_TOPIC);
  }

  asyncIteratorMatchmaking(clientId: string) {
    return (this.pubSub as any).asyncIterator(matchmakingTopic(clientId));
  }

  private createMatchFromQueue(a: MatchmakingEntry, b: MatchmakingEntry) {
    const firstIsWhite = randomInt(0, 2) === 0;
    const white = firstIsWhite ? a : b;
    const black = firstIsWhite ? b : a;

    const { game } = this.createGameDomain({
      code: null,
      white: { clientId: white.clientId, name: white.name ?? 'Player 1' },
      black: { clientId: black.clientId, name: black.name ?? 'Player 2' },
      timeControl: white.timeControl,
      status: GameStatus.IN_PROGRESS,
    });

    this.games.set(game.id, game);

    const gql = this.toGraphQL(game);
    this.logger.log(`matchFound gameId=${game.id} white=${white.clientId} black=${black.clientId}`);

    this.publishMatchmakingEvent({
      type: MatchmakingEventType.MATCH_FOUND,
      at: new Date(),
      clientId: white.clientId,
      gameId: game.id,
      playerColor: ColorEnum.WHITE,
      game: gql,
      message: 'Match found',
    });
    this.publishMatchmakingEvent({
      type: MatchmakingEventType.MATCH_FOUND,
      at: new Date(),
      clientId: black.clientId,
      gameId: game.id,
      playerColor: ColorEnum.BLACK,
      game: gql,
      message: 'Match found',
    });
  }

  private startRematch(game: GameDomain) {
    const oldPlayers = game.players.filter((p) => p.id !== 'OPEN');
    if (oldPlayers.length !== 2) return;

    const pWhite = oldPlayers.find((p) => p.color === ColorEnum.WHITE) as Player;
    const pBlack = oldPlayers.find((p) => p.color === ColorEnum.BLACK) as Player;

    const now = Date.now();

    const newWhite = new Player(pBlack.id, pBlack.name, ColorEnum.WHITE, true, game.timeControl.initialSeconds);
    const newBlack = new Player(pWhite.id, pWhite.name, ColorEnum.BLACK, false, game.timeControl.initialSeconds);

    game.players = [newWhite, newBlack];
    game.status = GameStatus.IN_PROGRESS;
    game.hasGameEnded = false;
    game.winner = null;
    game.reason = {};
    game.updatedAt = new Date(now);
    game.clock.remainingSeconds = {
      [ColorEnum.WHITE]: game.timeControl.initialSeconds,
      [ColorEnum.BLACK]: game.timeControl.initialSeconds,
    };
    game.clock.lastTickMs = now;
    game.rematch.requestedBy.clear();
    game.rematch.acceptedBy.clear();

    const gql = this.toGraphQL(game);
    this.publishGameEvent({
      type: GameEventType.REMATCH_STARTED,
      gameId: game.id,
      at: new Date(now),
      game: gql,
      message: 'Rematch started (colors swapped)',
    });
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

  private timeControlKey(tc: TimeControlDomain) {
    return `${tc.initialSeconds}+${tc.incrementSeconds}`;
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
    const nowMs = Date.now();

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
        lastTickMs: args.status === GameStatus.IN_PROGRESS ? nowMs : null,
      },
      rematch: {
        requestedBy: new Set<string>(),
        acceptedBy: new Set<string>(),
      },
    };

    return { game, playerColor: ColorEnum.WHITE };
  }

  private applyClockDelta(game: GameDomain, nowMs: number): boolean {
    if (game.status !== GameStatus.IN_PROGRESS || game.hasGameEnded) return false;
    if (!game.clock.lastTickMs) {
      game.clock.lastTickMs = nowMs;
      return false;
    }

    const elapsedSeconds = Math.floor((nowMs - game.clock.lastTickMs) / 1000);
    if (elapsedSeconds <= 0) return false;

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

      const gql = this.toGraphQL(game);
      this.publishGameEvent({
        type: GameEventType.GAME_ENDED,
        gameId: game.id,
        at: new Date(nowMs),
        game: gql,
        message: 'Timeout',
      });
    }

    return true;
  }

  private syncClockIntoPlayers(game: GameDomain) {
    game.players.forEach((p) => {
      p.time = game.clock.remainingSeconds[p.color as ColorEnum] ?? p.time;
    });
  }

  private publishGameEvent(event: GameEvent) {
    void this.pubSub.publish(GAME_EVENTS_TOPIC, { gameEvents: event });
    this.logger.debug(`event ${event.type} gameId=${event.gameId}`);
  }

  private publishMatchmakingEvent(event: MatchmakingEvent) {
    void this.pubSub.publish(matchmakingTopic(event.clientId), { matchmakingEvents: event });
    this.logger.debug(`matchmaking ${event.type} clientId=${event.clientId}`);
  }

  private toGraphQL(game: GameDomain): Game {
    const playingPlayer = PlayerHelper.getPlayingPlayer(game.players);
    const tc: TimeControl = {
      initialSeconds: game.timeControl.initialSeconds,
      incrementSeconds: game.timeControl.incrementSeconds,
    };
    return {
      id: game.id,
      code: game.code,
      status: game.status,
      players: game.players as any,
      boardFen: null,
      turnColor: playingPlayer.color as ColorEnum,
      timeControl: tc,
      createdAt: game.createdAt,
      updatedAt: game.updatedAt,
      state: {
        players: game.players as any,
        hasGameEnded: game.hasGameEnded,
        winner: game.winner as any,
        reason: game.reason as any,
      },
    };
  }
}
