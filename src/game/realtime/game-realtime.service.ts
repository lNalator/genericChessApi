import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomInt } from 'crypto';
import { OkResponse } from '../dto/game.types';
import {
  CreateInviteGameInput,
  EnqueueMatchmakingInput,
  JoinInviteGameInput,
  MakeMoveOnlineInput,
  QuitGameInput,
  RequestRematchInput,
  RespondRematchInput,
} from '../dto/game.inputs';
import {
  DequeueMatchmakingResponse,
  EnqueueMatchmakingResponse,
  Game,
  GameEvent,
  GameEventType,
  GameSession,
  GameStatus,
  MatchmakingEvent,
  MatchmakingEventType,
  TimeControl,
} from '../dto/game.types';
import { ColorEnum } from '../engine/enums/color.enum';
import PlayerHelper from '../engine/helpers/player.helper';
import { GameDomain, GameDomainEvent, GameDomainService } from '../domain/game-domain.service';
import { MatchmakingDomainEvent, MatchmakingDomainService } from '../domain/matchmaking-domain.service';
import { GameEventBusService } from './game-event-bus.service';

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'string' && value.length > 0 ? Number(value) : typeof value === 'number' ? value : fallback;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

@Injectable()
export class GameRealtimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GameRealtimeService.name);

  private tickInterval: NodeJS.Timeout | null = null;
  private readonly readyTimers = new Map<string, NodeJS.Timeout>();
  private readonly disconnectTimers = new Map<string, NodeJS.Timeout>();
  private readonly matchTimers = new Map<string, NodeJS.Timeout>();

  private readonly disconnectGraceSeconds = clampInt(process.env.DISCONNECT_GRACE_SECONDS, 15, 1, 15);
  private readonly gameReadyTimeoutSeconds = clampInt(process.env.GAME_READY_TIMEOUT_SECONDS, 10, 1, 30);
  private readonly matchAcceptTimeoutSeconds = clampInt(process.env.MATCH_ACCEPT_TIMEOUT_SECONDS, 10, 1, 30);

  constructor(
    private readonly gameDomain: GameDomainService,
    private readonly matchmakingDomain: MatchmakingDomainService,
    private readonly bus: GameEventBusService,
  ) {}

  onModuleInit() {
    this.tickInterval = setInterval(() => {
      const nowMs = Date.now();
      const { events } = this.gameDomain.tick(nowMs);
      this.publishGameDomainEvents(events);
    }, 1000);
  }

  onModuleDestroy() {
    if (this.tickInterval) clearInterval(this.tickInterval);
    this.tickInterval = null;

    for (const t of this.readyTimers.values()) clearTimeout(t);
    this.readyTimers.clear();

    for (const t of this.disconnectTimers.values()) clearTimeout(t);
    this.disconnectTimers.clear();

    for (const t of this.matchTimers.values()) clearTimeout(t);
    this.matchTimers.clear();
  }

  handleClientConnected(clientId: string) {
    const { events } = this.gameDomain.cancelDisconnectGrace(clientId);
    this.publishGameDomainEvents(events);
  }

  handleClientDisconnected(clientId: string) {
    const matchEvents = this.matchmakingDomain.handleClientDisconnected(clientId).events;
    this.publishMatchmakingDomainEvents(matchEvents);

    const game = this.gameDomain.findActiveGameByClientId(clientId);
    if (!game) return;

    const { deadlineMs, events } = this.gameDomain.startDisconnectGrace({
      gameId: game.id,
      clientId,
      graceSeconds: this.disconnectGraceSeconds,
      label: 'Disconnected',
    });

    this.publishGameDomainEvents(events);
    this.scheduleDisconnectExpiry(game.id, clientId, deadlineMs);
  }

  isClientInGame(gameId: string, clientId: string): boolean {
    return this.gameDomain.isClientInGame(gameId, clientId);
  }

  getGameSession(gameId: string, clientId: string): GameSession {
    const { game, playerColor } = this.gameDomain.getGameSession(gameId, clientId);
    return {
      gameId: game.id,
      code: game.code,
      playerColor,
      game: this.toGraphQL(game),
    };
  }

  createInviteGame(input: CreateInviteGameInput): GameSession {
    const { game, playerColor, events } = this.gameDomain.createInviteGame(input);
    this.publishGameDomainEvents(events);
    return {
      gameId: game.id,
      code: game.code,
      playerColor,
      game: this.toGraphQL(game),
    };
  }

  joinInviteGame(input: JoinInviteGameInput): GameSession {
    const { game, playerColor, events } = this.gameDomain.joinInviteGame({
      input,
      readyTimeoutSeconds: this.gameReadyTimeoutSeconds,
    });

    this.publishGameDomainEvents(events);

    const deadlineMs = game.ready.deadlineMs;
    if (game.status === GameStatus.READY_CHECK && deadlineMs) {
      this.scheduleReadyTimeout(game.id, deadlineMs);
    }

    return {
      gameId: game.id,
      code: game.code,
      playerColor,
      game: this.toGraphQL(game),
    };
  }

  clientReady(gameId: string, clientId: string): OkResponse {
    try {
      const { ok, game, started, events } = this.gameDomain.clientReady({ gameId, clientId });
      this.publishGameDomainEvents(events);
      if (started) this.clearReadyTimer(game.id);
      return { ok };
    } catch (e) {
      this.publishGameError({ gameId, clientId, error: e, fallbackCode: 'CLIENT_READY_FAILED' });
      throw e;
    }
  }

  makeMove(input: MakeMoveOnlineInput): Game {
    try {
      const { game, events } = this.gameDomain.makeMoveOnline(input);
      this.publishGameDomainEvents(events);
      return this.toGraphQL(game);
    } catch (e) {
      this.publishGameError({
        gameId: input.gameId,
        clientId: input.clientId,
        error: e,
        fallbackCode: 'MAKE_MOVE_FAILED',
      });
      throw e;
    }
  }

  requestRematch(input: RequestRematchInput): OkResponse {
    const { ok, events } = this.gameDomain.requestRematch(input);
    this.publishGameDomainEvents(events);
    return { ok };
  }

  respondRematch(input: RespondRematchInput): OkResponse {
    const { ok, game, events, readyCheckStarted } = this.gameDomain.respondRematch({
      input,
      readyTimeoutSeconds: this.gameReadyTimeoutSeconds,
    });

    this.publishGameDomainEvents(events);

    if (readyCheckStarted && game.ready.deadlineMs) {
      this.scheduleReadyTimeout(game.id, game.ready.deadlineMs);
    }

    return { ok };
  }

  quitGame(input: QuitGameInput): OkResponse {
    const { ok, game, events } = this.gameDomain.quitGame({
      input,
      graceSeconds: this.disconnectGraceSeconds,
    });

    this.publishGameDomainEvents(events);

    if (game) {
      const pending = game.disconnect.get(input.clientId);
      if (pending) this.scheduleDisconnectExpiry(game.id, input.clientId, pending.deadlineMs);
    }

    return { ok };
  }

  enqueueMatchmaking(input: EnqueueMatchmakingInput): EnqueueMatchmakingResponse {
    try {
      const { enqueued, events, matchCreated } = this.matchmakingDomain.enqueue({
        input,
        acceptTimeoutSeconds: this.matchAcceptTimeoutSeconds,
      });
      this.publishMatchmakingDomainEvents(events);

      if (matchCreated) {
        this.scheduleMatchAcceptTimeout(matchCreated.matchId, matchCreated.deadlineMs);
      }

      return { enqueued };
    } catch (e) {
      this.publishMatchmakingError({ clientId: input.clientId, error: e, fallbackCode: 'ENQUEUE_FAILED' });
      throw e;
    }
  }

  dequeueMatchmaking(clientId: string): DequeueMatchmakingResponse {
    const { dequeued, events } = this.matchmakingDomain.dequeue(clientId);
    this.publishMatchmakingDomainEvents(events);
    return { dequeued };
  }

  acceptMatch(clientId: string, matchId: string): OkResponse {
    try {
      const { ok, readyMatch, events } = this.matchmakingDomain.acceptMatch({ clientId, matchId });
      this.publishMatchmakingDomainEvents(events);

      if (!readyMatch) return { ok };

      this.clearMatchTimer(matchId);

      const firstIsWhite = randomInt(0, 2) === 0;
      const white = firstIsWhite ? readyMatch.a : readyMatch.b;
      const black = firstIsWhite ? readyMatch.b : readyMatch.a;

      const { game, events: gameEvents } = this.gameDomain.createMatchGame({
        white: { clientId: white.clientId, name: white.name ?? 'Player 1' },
        black: { clientId: black.clientId, name: black.name ?? 'Player 2' },
        timeControl: white.timeControl,
        readyTimeoutSeconds: this.gameReadyTimeoutSeconds,
      });

      this.publishGameDomainEvents(gameEvents);
      if (game.ready.deadlineMs) this.scheduleReadyTimeout(game.id, game.ready.deadlineMs);

      const deadlineAt = game.ready.deadlineMs ? new Date(game.ready.deadlineMs) : null;

      const tc: TimeControl = {
        initialSeconds: game.timeControl.initialSeconds,
        incrementSeconds: game.timeControl.incrementSeconds,
      };

      this.bus.publishMatchmakingEvent({
        type: MatchmakingEventType.MATCH_CONFIRMED,
        at: new Date(),
        clientId: white.clientId,
        matchId,
        gameId: game.id,
        playerColor: ColorEnum.WHITE,
        game: this.toGraphQL(game),
        timeControl: tc,
        deadlineAt,
        message: 'Match confirmed',
      });
      this.bus.publishMatchmakingEvent({
        type: MatchmakingEventType.MATCH_CONFIRMED,
        at: new Date(),
        clientId: black.clientId,
        matchId,
        gameId: game.id,
        playerColor: ColorEnum.BLACK,
        game: this.toGraphQL(game),
        timeControl: tc,
        deadlineAt,
        message: 'Match confirmed',
      });

      return { ok };
    } catch (e) {
      this.publishMatchmakingError({ clientId, error: e, fallbackCode: 'ACCEPT_MATCH_FAILED' });
      throw e;
    }
  }

  private publishGameError(args: {
    gameId: string;
    clientId: string;
    error: unknown;
    fallbackCode: string;
  }) {
    const { gameId, clientId, error, fallbackCode } = args;
    const game = this.gameDomain.getGame(gameId);
    if (!game) return;
    const message = error instanceof Error ? error.message : String(error);
    this.logger.warn(`game error ${fallbackCode} gameId=${gameId} clientId=${clientId} msg=${message}`);
    this.bus.publishGameEvent(
      this.toGraphQLEvent(game, {
        type: GameEventType.ERROR,
        gameId,
        at: new Date(),
        targetClientId: clientId,
        errorCode: fallbackCode,
        message,
      }),
    );
  }

  private publishMatchmakingError(args: { clientId: string; error: unknown; fallbackCode: string }) {
    const { clientId, error, fallbackCode } = args;
    const message = error instanceof Error ? error.message : String(error);
    this.logger.warn(`matchmaking error ${fallbackCode} clientId=${clientId} msg=${message}`);
    this.bus.publishMatchmakingEvent({
      type: MatchmakingEventType.ERROR,
      at: new Date(),
      clientId,
      matchId: null,
      gameId: null,
      playerColor: null,
      game: null,
      timeControl: null,
      deadlineAt: null,
      message,
      errorCode: fallbackCode,
    });
  }

  private scheduleReadyTimeout(gameId: string, deadlineMs: number) {
    this.clearReadyTimer(gameId);
    const delay = Math.max(0, deadlineMs - Date.now());
    const timer = setTimeout(() => {
      try {
        const { events } = this.gameDomain.readyTimeout({ gameId });
        this.publishGameDomainEvents(events);
      } catch (e) {
        this.logger.warn(`readyTimeout error gameId=${gameId} err=${String(e)}`);
      }
    }, delay);
    this.readyTimers.set(gameId, timer);
  }

  private clearReadyTimer(gameId: string) {
    const t = this.readyTimers.get(gameId);
    if (t) clearTimeout(t);
    this.readyTimers.delete(gameId);
  }

  private scheduleDisconnectExpiry(gameId: string, clientId: string, deadlineMs: number) {
    const key = `${gameId}:${clientId}`;
    const existing = this.disconnectTimers.get(key);
    if (existing) clearTimeout(existing);

    const delay = Math.max(0, deadlineMs - Date.now());
    const timer = setTimeout(() => {
      try {
        const { events } = this.gameDomain.expireDisconnect({ gameId, clientId });
        this.publishGameDomainEvents(events);
      } catch (e) {
        this.logger.warn(`disconnectExpiry error gameId=${gameId} clientId=${clientId} err=${String(e)}`);
      }
    }, delay);
    this.disconnectTimers.set(key, timer);
  }

  private scheduleMatchAcceptTimeout(matchId: string, deadlineMs: number) {
    this.clearMatchTimer(matchId);
    const delay = Math.max(0, deadlineMs - Date.now());
    const timer = setTimeout(() => {
      try {
        const { events } = this.matchmakingDomain.expireMatch(matchId);
        this.publishMatchmakingDomainEvents(events);
      } catch (e) {
        this.logger.warn(`matchAcceptTimeout error matchId=${matchId} err=${String(e)}`);
      }
    }, delay);
    this.matchTimers.set(matchId, timer);
  }

  private clearMatchTimer(matchId: string) {
    const t = this.matchTimers.get(matchId);
    if (t) clearTimeout(t);
    this.matchTimers.delete(matchId);
  }

  private publishGameDomainEvents(events: GameDomainEvent[]) {
    for (const ev of events) {
      const game = this.gameDomain.getGame(ev.gameId);
      if (!game) continue;
      this.bus.publishGameEvent(this.toGraphQLEvent(game, ev));
    }
  }

  private publishMatchmakingDomainEvents(events: MatchmakingDomainEvent[]) {
    for (const ev of events) {
      this.bus.publishMatchmakingEvent(this.toGraphQLMatchmakingEvent(ev));
    }
  }

  private toGraphQL(game: GameDomain): Game {
    const playingPlayer = PlayerHelper.getPlayingPlayer(game.players);
    const tc: TimeControl = {
      initialSeconds: game.timeControl.initialSeconds,
      incrementSeconds: game.timeControl.incrementSeconds,
    };
    const firstDisconnect = [...game.disconnect.entries()][0];
    return {
      id: game.id,
      code: game.code,
      status: game.status,
      players: game.players as any,
      boardFen: null,
      turnColor: playingPlayer.color as ColorEnum,
      timeControl: tc,
      disconnectGraceSeconds: this.disconnectGraceSeconds,
      disconnectingClientId: firstDisconnect ? firstDisconnect[0] : null,
      disconnectDeadlineAt: firstDisconnect ? new Date(firstDisconnect[1].deadlineMs) : null,
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

  private toGraphQLEvent(game: GameDomain, ev: GameDomainEvent): GameEvent {
    const gqlGame = this.toGraphQL(game);
    return {
      type: ev.type,
      gameId: ev.gameId,
      at: ev.at,
      message: ev.message,
      errorCode: ev.errorCode ?? null,
      targetClientId: ev.targetClientId ?? null,
      graceSeconds: ev.graceSeconds ?? null,
      timeoutSeconds: ev.timeoutSeconds ?? null,
      deadlineAt: ev.deadlineAt ?? null,
      move: ev.move,
      game: gqlGame,
      player: ev.playerId ? (gqlGame.players.find((p) => p.id === ev.playerId) as any) : null,
    };
  }

  private toGraphQLMatchmakingEvent(ev: MatchmakingDomainEvent): MatchmakingEvent {
    const tc = ev.timeControl
      ? ({ initialSeconds: ev.timeControl.initialSeconds, incrementSeconds: ev.timeControl.incrementSeconds } as TimeControl)
      : null;

    return {
      type: ev.type,
      at: ev.at,
      clientId: ev.clientId,
      matchId: ev.matchId ?? null,
      gameId: null,
      playerColor: null,
      game: null,
      timeControl: tc,
      deadlineAt: ev.deadlineAt ?? null,
      message: ev.message,
      errorCode: ev.errorCode ?? null,
    };
  }
}
