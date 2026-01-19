import { Module } from '@nestjs/common';
import { PubSub } from 'graphql-subscriptions';
import { ApolloDomainEventPublisherAdapter } from './infrastructure/pubsub/apollo-domain-event-publisher.adapter';
import { InMemoryGameSessionRepository } from './infrastructure/repositories/in-memory-game-session.repository';
import { InMemoryMatchmakingQueueRepository } from './infrastructure/repositories/in-memory-matchmaking-queue.repository';
import { SystemClockAdapter } from './infrastructure/clock/system-clock.adapter';
import { GameClockTickerService } from './infrastructure/clock/game-clock-ticker.service';
import { InviteCodeGenerator } from './infrastructure/utils/invite-code-generator';
import { GameSessionService } from './application/services/game-session.service';
import { GameRuntimeService } from './application/services/game-runtime.service';
import { MatchmakingService } from './application/services/matchmaking.service';
import { BotGameService } from './application/services/bot-game.service';
import { StockfishService } from './application/services/stockfish.service';
import { STOCKFISH_PORT } from './application/ports/stockfish.port';
import { MultiplayerResolver } from './graphql/resolvers/multiplayer.resolver';
import { BotResolver } from './graphql/resolvers/bot.resolver';
import { StockfishResolver } from './graphql/resolvers/stockfish.resolver';
import { SessionMapper } from './graphql/mappers/session.mapper';
import { GameEventMapper } from './graphql/mappers/game-event.mapper';
import { MatchmakingEventMapper } from './graphql/mappers/matchmaking-event.mapper';
import { SuddenDeathStrategy } from '../domain/strategies/sudden-death.strategy';
import { NoTimeStrategy } from '../domain/strategies/no-time.strategy';
import { MULTIPLAYER_CONFIG_TOKEN, buildMultiplayerConfig } from './application/services/multiplayer-config';
import { CLOCK_PORT } from './application/ports/clock.port';
import { DOMAIN_EVENT_PUBLISHER } from './application/ports/domain-event-publisher.port';
import { CODE_GENERATOR_PORT } from './application/ports/code-generator.port';
import { GAME_SESSION_REPOSITORY } from './application/ports/game-session-repository.port';
import { MATCHMAKING_QUEUE_REPOSITORY } from './application/ports/matchmaking-queue-repository.port';
import { StockfishUciAdapter } from './infrastructure/stockfish/stockfish-uci.adapter';

@Module({
  providers: [
    MultiplayerResolver,
    BotResolver,
    StockfishResolver,
    GameSessionService,
    GameRuntimeService,
    MatchmakingService,
    BotGameService,
    StockfishService,
    StockfishUciAdapter,
    SessionMapper,
    GameEventMapper,
    MatchmakingEventMapper,
    InMemoryGameSessionRepository,
    InMemoryMatchmakingQueueRepository,
    SystemClockAdapter,
    GameClockTickerService,
    SuddenDeathStrategy,
    NoTimeStrategy,
    InviteCodeGenerator,
    ApolloDomainEventPublisherAdapter,
    {
      provide: GAME_SESSION_REPOSITORY,
      useExisting: InMemoryGameSessionRepository,
    },
    {
      provide: MATCHMAKING_QUEUE_REPOSITORY,
      useExisting: InMemoryMatchmakingQueueRepository,
    },
    {
      provide: DOMAIN_EVENT_PUBLISHER,
      useExisting: ApolloDomainEventPublisherAdapter,
    },
    {
      provide: CLOCK_PORT,
      useExisting: SystemClockAdapter,
    },
    {
      provide: CODE_GENERATOR_PORT,
      useExisting: InviteCodeGenerator,
    },
    {
      provide: STOCKFISH_PORT,
      useExisting: StockfishUciAdapter,
    },
    {
      provide: PubSub,
      useValue: new PubSub(),
    },
    {
      provide: MULTIPLAYER_CONFIG_TOKEN,
      useValue: buildMultiplayerConfig(),
    },
  ],
  exports: [GameSessionService, GameRuntimeService, MatchmakingService],
})
export class MultiplayerModule {}
