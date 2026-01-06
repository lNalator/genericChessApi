import { Module } from '@nestjs/common';
import { PubSub } from 'graphql-subscriptions';
import { GameResolver } from './game.resolver';
import { GameDomainService } from './domain/game-domain.service';
import { MatchmakingDomainService } from './domain/matchmaking-domain.service';
import { GameEventBusService } from './realtime/game-event-bus.service';
import { GameRealtimeService } from './realtime/game-realtime.service';

@Module({
  providers: [
    GameResolver,
    GameDomainService,
    MatchmakingDomainService,
    GameEventBusService,
    GameRealtimeService,
    {
      provide: PubSub,
      useValue: new PubSub(),
    },
  ],
  exports: [GameRealtimeService],
})
export class GameModule {}
