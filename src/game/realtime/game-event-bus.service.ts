import { Injectable, Logger } from '@nestjs/common';
import { PubSub } from 'graphql-subscriptions';
import { GameEvent, MatchmakingEvent } from '../dto/game.types';

export const GAME_EVENTS_TOPIC = 'GAME_EVENTS_TOPIC';

export function matchmakingTopic(clientId: string) {
  return `MATCHMAKING_${clientId}`;
}

@Injectable()
export class GameEventBusService {
  private readonly logger = new Logger(GameEventBusService.name);

  constructor(private readonly pubSub: PubSub) {}

  publishGameEvent(event: GameEvent) {
    void this.pubSub.publish(GAME_EVENTS_TOPIC, { gameEvents: event });
    this.logger.debug(`event ${event.type} gameId=${event.gameId}`);
  }

  publishMatchmakingEvent(event: MatchmakingEvent) {
    void this.pubSub.publish(matchmakingTopic(event.clientId), { matchmakingEvents: event });
    this.logger.debug(`matchmaking ${event.type} clientId=${event.clientId}`);
  }

  asyncIteratorGameEvents() {
    return (this.pubSub as any).asyncIterator(GAME_EVENTS_TOPIC);
  }

  asyncIteratorMatchmaking(clientId: string) {
    return (this.pubSub as any).asyncIterator(matchmakingTopic(clientId));
  }
}

