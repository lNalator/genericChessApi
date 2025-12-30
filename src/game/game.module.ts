import { Module } from '@nestjs/common';
import { PubSub } from 'graphql-subscriptions';
import { GameResolver } from './game.resolver';
import { GameService } from './game.service';

@Module({
  providers: [
    GameResolver,
    GameService,
    {
      provide: PubSub,
      useValue: new PubSub(),
    },
  ],
})
export class GameModule {}

