import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import PlayerHelper from '../../domain/engine/helpers/player.helper';
import { GameSession } from '../../domain/entities/game-session';
import { GameDomainEvent, GameDomainEventType } from '../../domain/events/game-domain-event';
import { ColorEnum } from '../../domain/engine/enums/color.enum';
import { GameSessionState } from '../../domain/types/game-session-state.enum';
import { ReadyCheckStatus } from '../../domain/types/ready-check';
import { GameSessionTransitionType, applyGameSessionTransition } from '../../domain/state-machines/game-session-state-machine';
import { TimeControlStrategy } from '../../domain/strategies/time-control-strategy';
import { SuddenDeathStrategy } from '../../domain/strategies/sudden-death.strategy';
import { CLOCK_PORT, ClockPort } from '../ports/clock.port';
import { DOMAIN_EVENT_PUBLISHER, DomainEventPublisherPort } from '../ports/domain-event-publisher.port';
import { GAME_SESSION_REPOSITORY, GameSessionRepositoryPort } from '../ports/game-session-repository.port';
import {
  applyMoveOnBoard,
  buildClockEvent,
  ensureClientId,
  ensurePlayerInSession,
  evaluateMateState,
  finishByTimeoutState,
  readyTimerId,
} from './game-session.helpers';
import { ClientReadyCommand } from '../commands/client-ready.command';
import { MakeMoveCommand } from '../commands/make-move.command';
import { ResignCommand } from '../commands/resign.command';
import { GameMove } from '../../domain/types/move';

@Injectable()
export class GameRuntimeService {
  constructor(
    @Inject(GAME_SESSION_REPOSITORY) private readonly sessions: GameSessionRepositoryPort,
    @Inject(DOMAIN_EVENT_PUBLISHER) private readonly publisher: DomainEventPublisherPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    @Inject(SuddenDeathStrategy) private readonly strategy: TimeControlStrategy,
  ) {}

  clientReady(cmd: ClientReadyCommand): { ok: boolean; session: GameSession } {
    ensureClientId(cmd.clientId);
    const session = this.requireSession(cmd.gameId);
    ensurePlayerInSession(session, cmd.clientId);

    if (!session.readyCheck) {
      return { ok: true, session };
    }

    if (session.readyCheck.status === ReadyCheckStatus.COMPLETED) {
      return { ok: true, session };
    }

    if (session.readyCheck.status === ReadyCheckStatus.FAILED) {
      this.publishReadyError(session, cmd.clientId, 'READY_TIMEOUT', 'Ready check already failed');
      return { ok: false, session };
    }

    if (session.readyCheck.readyClientIds.has(cmd.clientId)) {
      return { ok: true, session };
    }

    session.readyCheck.readyClientIds.add(cmd.clientId);
    const readyEvent: GameDomainEvent = {
      type: GameDomainEventType.PLAYER_READY,
      at: new Date(),
      gameId: session.id,
      playerId: cmd.clientId,
    };

    const allReady = session.readyCheck.requiredClientIds.every((id) =>
      session.readyCheck?.readyClientIds.has(id),
    );
    if (!allReady) {
      this.sessions.save(session);
      this.publisher.publishGameEvents([readyEvent]);
      return { ok: true, session };
    }

    const nowMs = this.clock.nowMs();
    session.readyCheck.status = ReadyCheckStatus.COMPLETED;
    session.state = applyGameSessionTransition(session.state, { type: GameSessionTransitionType.START_GAME });
    session.clock = this.strategy.start(session.clock, nowMs);
    session.clock.activeColor = PlayerHelper.getPlayingPlayer(session.players).color as ColorEnum;
    session.clock.lastUpdatedMs = nowMs;
    session.updatedAt = new Date(nowMs);
    this.sessions.save(session);
    this.clock.clear(readyTimerId(session.id));

    const startedEvent: GameDomainEvent = {
      type: GameDomainEventType.GAME_STARTED,
      at: new Date(nowMs),
      gameId: session.id,
      timeControl: session.timeControl,
      message: 'Game started',
    };

    this.publisher.publishGameEvents([readyEvent, startedEvent, buildClockEvent(session, nowMs)]);
    return { ok: true, session };
  }

  notifyDisconnect(gameId: string, clientId: string) {
    ensureClientId(clientId);
    const session = this.requireSession(gameId);
    ensurePlayerInSession(session, clientId);
    const opponent = session.players.find((p) => p.id !== clientId);
    session.state = applyGameSessionTransition(session.state, { type: GameSessionTransitionType.END_GAME });
    session.winnerClientId = opponent ? opponent.id : null;
    session.endReason = 'DISCONNECT';
    session.pendingDrawByClientId = null;
    session.clock = this.strategy.pause(session.clock);
    session.updatedAt = new Date();
    this.sessions.save(session);
    this.publisher.publishGameEvents([
      {
        type: GameDomainEventType.GAME_ENDED,
        at: new Date(),
        gameId: session.id,
        playerId: clientId,
        message: 'Player disconnected',
      },
    ]);
    this.sessions.delete(session.id);
  }

  notifyReconnect(gameId: string, clientId: string) {
    ensureClientId(clientId);
    const session = this.sessions.findById(gameId);
    if (!session) return;
    if (session.state === GameSessionState.ENDED) {
      this.sessions.delete(session.id);
    }
  }

  offerDraw(gameId: string, clientId: string): { ok: boolean; accepted: boolean; session: GameSession } {
    ensureClientId(clientId);
    const session = this.requireSession(gameId);
    ensurePlayerInSession(session, clientId);
    if (session.state !== GameSessionState.RUNNING) {
      throw new BadRequestException('Game not running');
    }
    if (session.pendingDrawByClientId && session.pendingDrawByClientId !== clientId) {
      session.state = GameSessionState.ENDED;
      session.winnerClientId = null;
      session.endReason = 'DRAW_AGREED';
      session.clock = this.strategy.pause(session.clock);
      session.pendingDrawByClientId = null;
      session.updatedAt = new Date();
      this.sessions.save(session);
      this.publisher.publishGameEvents([
        {
          type: GameDomainEventType.GAME_ENDED,
          at: new Date(),
          gameId: session.id,
          message: 'Draw agreed',
        },
      ]);
      this.sessions.delete(session.id);
      return { ok: true, accepted: true, session };
    }

    session.pendingDrawByClientId = clientId;
    this.sessions.save(session);
    this.publisher.publishGameEvents([
      {
        type: GameDomainEventType.DRAW_OFFERED,
        at: new Date(),
        gameId: session.id,
        playerId: clientId,
      },
    ]);
    return { ok: true, accepted: false, session };
  }

  makeMove(cmd: MakeMoveCommand): GameSession {
    ensureClientId(cmd.clientId);
    const session = this.requireSession(cmd.gameId);
    if (session.state !== GameSessionState.RUNNING) {
      throw new BadRequestException('Game not running');
    }

    const player = ensurePlayerInSession(session, cmd.clientId);
    const playing = PlayerHelper.getPlayingPlayer(session.players);
    if (playing.id !== player.id) throw new BadRequestException('Not your turn');

    const nowMs = this.clock.nowMs();
    const tickResult = this.strategy.tick(session.clock, nowMs);
    session.clock = tickResult.state;
    if (tickResult.expiredColor) {
      const timeoutEvents = finishByTimeoutState(
        session,
        tickResult.expiredColor as ColorEnum,
        nowMs,
        this.strategy,
      );
      this.sessions.save(session);
      this.publisher.publishGameEvents(timeoutEvents);
      this.sessions.delete(session.id);
      return session;
    }

    const notPlayingPlayer = PlayerHelper.getNotPlayingPlayer(session.players);
    applyMoveOnBoard(session, cmd, playing, notPlayingPlayer);
    const afterMove = this.strategy.onMove(session.clock, playing.color as ColorEnum, nowMs);
    session.clock = afterMove.state;

    const move: GameMove = {
      from: { ...cmd.from },
      to: { ...cmd.to },
      promotion: cmd.promotion ?? null,
      by: cmd.clientId,
      playedAt: new Date(nowMs),
    };
    session.moves.push(move);

    const endState = evaluateMateState(session, playing, notPlayingPlayer);
    const ended = Boolean(endState);
    if (endState) {
      session.winnerClientId = endState.winnerId;
      session.endReason = endState.reason;
    }
    if (!ended) {
      PlayerHelper.switchPlayerTurn(session.players);
    }

    session.updatedAt = new Date(nowMs);
    this.sessions.save(session);

    const events: GameDomainEvent[] = [
      {
        type: GameDomainEventType.MOVE_APPLIED,
        at: new Date(nowMs),
        gameId: session.id,
        move,
        playerId: cmd.clientId,
      },
      buildClockEvent(session, nowMs),
    ];

    if (endState) {
      events.push({
        type: GameDomainEventType.GAME_ENDED,
        at: new Date(nowMs),
        gameId: session.id,
        message: session.endReason ?? 'Game ended',
      });
    }

    this.publisher.publishGameEvents(events);
    if (ended) this.sessions.delete(session.id);
    return session;
  }

  resign(cmd: ResignCommand): GameSession {
    ensureClientId(cmd.clientId);
    const session = this.requireSession(cmd.gameId);
    ensurePlayerInSession(session, cmd.clientId);
    if (session.state === GameSessionState.ENDED) {
      this.sessions.delete(session.id);
      return session;
    }
    if (session.state === GameSessionState.WAITING_FOR_PLAYER) {
      throw new BadRequestException('Game has not started');
    }

    const opponent = session.players.find((p) => p.id !== cmd.clientId);
    session.state = applyGameSessionTransition(session.state, { type: GameSessionTransitionType.END_GAME });
    session.winnerClientId = opponent ? opponent.id : null;
    session.endReason = 'RESIGN';
    session.readyCheck = null;
    session.clock = this.strategy.pause(session.clock);
    session.updatedAt = new Date();
    this.sessions.save(session);

    this.publisher.publishGameEvents([
      {
        type: GameDomainEventType.GAME_ENDED,
        at: new Date(),
        gameId: session.id,
        message: 'Player resigned',
        playerId: cmd.clientId,
      },
    ]);
    this.sessions.delete(session.id);
    return session;
  }

  tick(): void {
    const nowMs = this.clock.nowMs();
    const running = this.sessions.list().filter((s) => s.state === GameSessionState.RUNNING);
    const events: GameDomainEvent[] = [];

    for (const session of running) {
      const tickResult = this.strategy.tick(session.clock, nowMs);
      session.clock = tickResult.state;
      if (tickResult.expiredColor) {
        events.push(...finishByTimeoutState(session, tickResult.expiredColor as ColorEnum, nowMs, this.strategy));
        this.sessions.save(session);
        this.sessions.delete(session.id);
      } else {
        events.push(buildClockEvent(session, nowMs));
        this.sessions.save(session);
      }
    }

    if (events.length > 0) {
      this.publisher.publishGameEvents(events);
    }
  }

  handleReadyTimeout(gameId: string) {
    const session = this.sessions.findById(gameId);
    if (!session || !session.readyCheck) return;
    if (session.state !== GameSessionState.READY_CHECK) return;
    if (session.readyCheck.status !== ReadyCheckStatus.PENDING) return;

    session.readyCheck.status = ReadyCheckStatus.FAILED;
    session.state = applyGameSessionTransition(session.state, { type: GameSessionTransitionType.READY_FAILED });
    session.endReason = 'READY_TIMEOUT';
    session.updatedAt = new Date();
    this.sessions.save(session);

    const events = session.readyCheck.requiredClientIds.map((clientId) => ({
      type: GameDomainEventType.ERROR_OCCURRED,
      at: new Date(),
      gameId: session.id,
      targetClientId: clientId,
      errorCode: 'READY_TIMEOUT',
      message: 'Ready check timed out',
    }));
    this.publisher.publishGameEvents(events);
    this.sessions.delete(session.id);
  }

  private requireSession(gameId: string): GameSession {
    const session = this.sessions.findById(gameId);
    if (!session) throw new BadRequestException('Game not found');
    return session;
  }

  private publishReadyError(session: GameSession, clientId: string, errorCode: string, message: string) {
    this.publisher.publishGameEvents([
      {
        type: GameDomainEventType.ERROR_OCCURRED,
        at: new Date(),
        gameId: session.id,
        targetClientId: clientId,
        errorCode,
        message,
      },
    ]);
  }
}
