import { Inject, Injectable, Logger } from '@nestjs/common';
import Player from '../../../domain/engine/entities/player.model';
import { GameSession } from '../../../domain/entities/game-session';
import { GameDomainEventType } from '../../../domain/events/game-domain-event';
import { ColorEnum } from '../../../domain/engine/enums/color.enum';
import { GameSessionState } from '../../../domain/types/game-session-state.enum';
import { TimeControlConfig } from '../../../domain/types/time-control';
import { TimeControlStrategy } from '../../../domain/strategies/time-control-strategy';
import { NoTimeStrategy } from '../../../domain/strategies/no-time.strategy';
import { CLOCK_PORT, ClockPort } from '../ports/clock.port';
import { CODE_GENERATOR_PORT, CodeGeneratorPort } from '../ports/code-generator.port';
import { DOMAIN_EVENT_PUBLISHER, DomainEventPublisherPort } from '../ports/domain-event-publisher.port';
import { GAME_SESSION_REPOSITORY, GameSessionRepositoryPort } from '../ports/game-session-repository.port';
import { CreateBotGameCommand } from '../commands/create-bot-game.command';
import { BotMoveCommand } from '../commands/bot-move.command';
import { buildClockEvent, ensureClientId } from './game-session.helpers';
import { GameRuntimeService } from './game-runtime.service';
import { StockfishService } from './stockfish.service';
import { buildFen, parseUciMove } from './bot-game.helpers';

type BotMoveResult = {
  bestMove?: string | null;
  ponder?: string | null;
  session: GameSession;
};

const BOT_ID = 'STOCKFISH';
const BOT_NAME = 'Stockfish';
const BOT_TIME_CONTROL: TimeControlConfig = { initialSeconds: 0, incrementSeconds: 0 };

@Injectable()
export class BotGameService {
  private readonly logger = new Logger(BotGameService.name);

  constructor(
    @Inject(GAME_SESSION_REPOSITORY) private readonly sessions: GameSessionRepositoryPort,
    @Inject(DOMAIN_EVENT_PUBLISHER) private readonly publisher: DomainEventPublisherPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    @Inject(CODE_GENERATOR_PORT) private readonly codeGen: CodeGeneratorPort,
    @Inject(NoTimeStrategy) private readonly strategy: TimeControlStrategy,
    private readonly runtime: GameRuntimeService,
    private readonly stockfish: StockfishService,
  ) {}

  createBotGame(cmd: CreateBotGameCommand): { session: GameSession; playerColor: ColorEnum } {
    ensureClientId(cmd.clientId);
    const now = this.clock.nowMs();
    const white = new Player(cmd.clientId, cmd.name ?? 'Player', ColorEnum.WHITE, true, 0);
    const black = new Player(BOT_ID, BOT_NAME, ColorEnum.BLACK, false, 0);

    const session: GameSession = {
      id: this.codeGen.generateGameId(),
      code: null,
      state: GameSessionState.RUNNING,
      origin: 'bot',
      players: [white, black],
      timeControl: BOT_TIME_CONTROL,
      clock: this.strategy.createState(BOT_TIME_CONTROL, now, ColorEnum.WHITE),
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
        at: new Date(now),
        gameId: session.id,
        message: 'Bot game created',
        timeControl: session.timeControl,
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
      {
        type: GameDomainEventType.GAME_STARTED,
        at: new Date(now),
        gameId: session.id,
        message: 'Bot game started',
        timeControl: session.timeControl,
      },
      buildClockEvent(session, now),
    ]);

    this.logger.debug(`Bot game started gameId=${session.id} clientId=${cmd.clientId}`);
    return { session, playerColor: ColorEnum.WHITE };
  }

  async playBotMove(cmd: BotMoveCommand): Promise<BotMoveResult> {
    ensureClientId(cmd.clientId);
    const afterPlayerMove = this.runtime.makeMove({
      clientId: cmd.clientId,
      gameId: cmd.gameId,
      from: cmd.from,
      to: cmd.to,
      promotion: cmd.promotion,
    });

    if (afterPlayerMove.state !== GameSessionState.RUNNING) {
      return { bestMove: null, ponder: null, session: afterPlayerMove };
    }

    const fen = buildFen(afterPlayerMove);
    const engineMove = await this.stockfish.bestMove(fen, cmd.movetimeMs);
    const parsed = parseUciMove(engineMove.bestMove);
    if (!parsed) {
      return { bestMove: engineMove.bestMove, ponder: engineMove.ponder ?? null, session: afterPlayerMove };
    }

    const afterBotMove = this.runtime.makeMove({
      clientId: BOT_ID,
      gameId: cmd.gameId,
      from: parsed.from,
      to: parsed.to,
      promotion: parsed.promotion,
    });

    return { bestMove: engineMove.bestMove, ponder: engineMove.ponder ?? null, session: afterBotMove };
  }
}
