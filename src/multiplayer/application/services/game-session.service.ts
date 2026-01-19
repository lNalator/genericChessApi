import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import Player from '../../../domain/engine/entities/player.model';
import { GameSession } from '../../../domain/entities/game-session';
import { GameDomainEventType } from '../../../domain/events/game-domain-event';
import { ColorEnum } from '../../../domain/engine/enums/color.enum';
import { GameSessionState } from '../../../domain/types/game-session-state.enum';
import { normalizeTimeControl, TimeControlConfig } from '../../../domain/types/time-control';
import { GameSessionTransitionType, applyGameSessionTransition } from '../../../domain/state-machines/game-session-state-machine';
import { TimeControlStrategy } from '../../../domain/strategies/time-control-strategy';
import { SuddenDeathStrategy } from '../../../domain/strategies/sudden-death.strategy';
import { ClockPort, CLOCK_PORT } from '../ports/clock.port';
import { CodeGeneratorPort, CODE_GENERATOR_PORT } from '../ports/code-generator.port';
import { DomainEventPublisherPort, DOMAIN_EVENT_PUBLISHER } from '../ports/domain-event-publisher.port';
import { GameSessionRepositoryPort, GAME_SESSION_REPOSITORY } from '../ports/game-session-repository.port';
import { CreateInviteGameCommand } from '../commands/create-invite-game.command';
import { JoinInviteGameCommand } from '../commands/join-invite-game.command';
import { MULTIPLAYER_CONFIG_TOKEN, MultiplayerConfig } from './multiplayer-config';
import { GameRuntimeService } from './game-runtime.service';
import {
  buildReadyEvents,
  createReadyCheck,
  ensureClientId,
  ensurePlayerInSession,
  readyTimerId,
} from './game-session.helpers';

type SessionWithColor = {
  session: GameSession;
  playerColor: ColorEnum;
};

@Injectable()
export class GameSessionService {
  private readonly logger = new Logger(GameSessionService.name);

  constructor(
    @Inject(GAME_SESSION_REPOSITORY) private readonly sessions: GameSessionRepositoryPort,
    @Inject(DOMAIN_EVENT_PUBLISHER) private readonly publisher: DomainEventPublisherPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    @Inject(CODE_GENERATOR_PORT) private readonly codeGen: CodeGeneratorPort,
    @Inject(SuddenDeathStrategy) private readonly strategy: TimeControlStrategy,
    @Inject(MULTIPLAYER_CONFIG_TOKEN) private readonly config: MultiplayerConfig,
    private readonly runtime: GameRuntimeService,
  ) {}

  createInviteGame(cmd: CreateInviteGameCommand): SessionWithColor {
    ensureClientId(cmd.clientId);
    const timeControl = normalizeTimeControl(cmd.timeControl);
    const now = this.clock.nowMs();
    const white = new Player(cmd.clientId, cmd.name ?? 'Player 1', ColorEnum.WHITE, true, timeControl.initialSeconds);
    const black = new Player('OPEN', 'Waiting for player', ColorEnum.BLACK, false, timeControl.initialSeconds);

    const session: GameSession = {
      id: this.codeGen.generateGameId(),
      code: this.codeGen.generateInviteCode(),
      state: GameSessionState.WAITING_FOR_PLAYER,
      origin: 'invite',
      players: [white, black],
      timeControl,
      clock: this.strategy.createState(timeControl, now, ColorEnum.WHITE),
      moves: [],
      readyCheck: null,
      disconnectDeadlines: {},
      pendingDrawByClientId: null,
      winnerClientId: null,
      endReason: null,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    };

    this.sessions.save(session);
    this.publisher.publishGameEvents([
      {
        type: GameDomainEventType.SESSION_CREATED,
        at: session.createdAt,
        gameId: session.id,
        message: 'Invite game created',
        timeControl,
      },
      {
        type: GameDomainEventType.PLAYER_JOINED,
        at: session.createdAt,
        gameId: session.id,
        playerId: cmd.clientId,
        playerColor: ColorEnum.WHITE,
      },
    ]);

    return { session, playerColor: ColorEnum.WHITE };
  }

  joinInviteGame(cmd: JoinInviteGameCommand): SessionWithColor {
    ensureClientId(cmd.clientId);
    const code = cmd.code.trim().toUpperCase();
    if (!code) throw new BadRequestException('Code is required');

    const session = this.sessions.findByCode(code);
    if (!session) throw new NotFoundException('Game not found');
    if (session.state === GameSessionState.ENDED) throw new BadRequestException('Game already ended');

    const already = session.players.find((p) => p.id === cmd.clientId);
    if (already) {
      return { session, playerColor: already.color as ColorEnum };
    }

    const openIndex = session.players.findIndex((p) => p.id === 'OPEN');
    if (openIndex === -1) throw new BadRequestException('Game is full');
    const openSlot = session.players[openIndex];
    const replacement = new Player(
      cmd.clientId,
      cmd.name ?? 'Player',
      openSlot.color as ColorEnum,
      false,
      session.timeControl.initialSeconds,
      openSlot.pieces,
    );
    session.players[openIndex] = replacement;

    const now = this.clock.nowMs();
    session.state = applyGameSessionTransition(session.state, { type: GameSessionTransitionType.START_READY_CHECK });
    session.readyCheck = createReadyCheck(session, this.config.readyTimeoutSeconds, now);
    session.updatedAt = new Date(now);
    this.sessions.save(session);

    const loadEvents = buildReadyEvents(session, now);
    this.publisher.publishGameEvents([
      {
        type: GameDomainEventType.PLAYER_JOINED,
        at: new Date(now),
        gameId: session.id,
        playerId: cmd.clientId,
        playerColor: replacement.color as ColorEnum,
      },
      ...loadEvents,
    ]);

    this.scheduleReadyTimeout(session);
    return { session, playerColor: replacement.color as ColorEnum };
  }

  createMatchSession(args: {
    white: { clientId: string; name?: string | null };
    black: { clientId: string; name?: string | null };
    timeControl: TimeControlConfig;
  }): GameSession {
    const timeControl = normalizeTimeControl(args.timeControl);
    const now = this.clock.nowMs();
    const white = new Player(
      args.white.clientId,
      args.white.name ?? 'White',
      ColorEnum.WHITE,
      true,
      timeControl.initialSeconds,
    );
    const black = new Player(
      args.black.clientId,
      args.black.name ?? 'Black',
      ColorEnum.BLACK,
      false,
      timeControl.initialSeconds,
    );

    const session: GameSession = {
      id: this.codeGen.generateGameId(),
      code: null,
      state: GameSessionState.WAITING_FOR_PLAYER,
      origin: 'matchmaking',
      players: [white, black],
      timeControl,
      clock: this.strategy.createState(timeControl, now, ColorEnum.WHITE),
      moves: [],
      readyCheck: null,
      disconnectDeadlines: {},
      pendingDrawByClientId: null,
      winnerClientId: null,
      endReason: null,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    };

    session.state = applyGameSessionTransition(session.state, { type: GameSessionTransitionType.START_READY_CHECK });
    session.readyCheck = createReadyCheck(session, this.config.readyTimeoutSeconds, now);
    this.sessions.save(session);

    const events = [
      {
        type: GameDomainEventType.SESSION_CREATED,
        at: new Date(now),
        gameId: session.id,
        message: 'Matchmaking session created',
        timeControl,
      },
      {
        type: GameDomainEventType.PLAYER_JOINED,
        at: new Date(now),
        gameId: session.id,
        playerId: white.id,
        playerColor: ColorEnum.WHITE,
      },
      {
        type: GameDomainEventType.PLAYER_JOINED,
        at: new Date(now),
        gameId: session.id,
        playerId: black.id,
        playerColor: ColorEnum.BLACK,
      },
      ...buildReadyEvents(session, now),
    ];
    this.publisher.publishGameEvents(events);
    this.scheduleReadyTimeout(session);

    return session;
  }

  getSession(gameId: string, clientId: string): SessionWithColor {
    ensureClientId(clientId);
    const session = this.requireSession(gameId);
    const player = ensurePlayerInSession(session, clientId);
    return { session, playerColor: player.color as ColorEnum };
  }

  findSessionByClientId(clientId: string): GameSession | null {
    return this.sessions.findByClientId(clientId);
  }

  private scheduleReadyTimeout(session: GameSession) {
    if (!session.readyCheck?.deadlineAt) return;
    const deadlineMs = session.readyCheck.deadlineAt.getTime();
    this.clock.schedule(readyTimerId(session.id), deadlineMs, () => {
      try {
        this.runtime.handleReadyTimeout(session.id);
      } catch (e) {
        this.logger.warn(`ready timeout failed gameId=${session.id} err=${String(e)}`);
      }
    });
  }

  private requireSession(gameId: string): GameSession {
    const session = this.sessions.findById(gameId);
    if (!session) throw new NotFoundException('Game not found');
    return session;
  }

  isClientInGame(gameId: string, clientId: string): boolean {
    const session = this.sessions.findById(gameId);
    if (!session) return false;
    return session.players.some((p) => p.id === clientId);
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
