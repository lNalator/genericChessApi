import { Injectable } from '@nestjs/common';
import { PubSub } from 'graphql-subscriptions';
import { DomainEventPublisherPort } from '../../application/ports/domain-event-publisher.port';
import {
  GameDomainEvent,
  GameDomainEventType,
} from '../../../domain/events/game-domain-event';
import { MatchmakingDomainEvent } from '../../../domain/events/matchmaking-domain-event';

const GAME_CHANNEL = 'game.events';
const MATCHMAKING_CHANNEL = 'matchmaking.events';

@Injectable()
export class ApolloDomainEventPublisherAdapter implements DomainEventPublisherPort {
  private readonly logEvents = 'true';

  constructor(private readonly pubSub: PubSub) {}

  publishGameEvents(events: GameDomainEvent[]): void {
    for (const ev of events) {
      if (this.logEvents && ev.type !== GameDomainEventType.CLOCK_UPDATED) {
        console.log('[multiplayer][game-event]', ev.type, ev);
      }
      this.pubSub.publish(GAME_CHANNEL, { gameEvent: ev });
    }
  }

  publishMatchmakingEvents(events: MatchmakingDomainEvent[]): void {
    for (const ev of events) {
      if (this.logEvents) {
        console.log('[multiplayer][matchmaking-event]', ev.type, ev);
      }
      this.pubSub.publish(MATCHMAKING_CHANNEL, { matchmakingEvent: ev });
    }
  }

  asyncIteratorGameEvents() {
    return this.pubSub.asyncIterator<GameDomainEvent>(GAME_CHANNEL);
  }

  asyncIteratorMatchmakingEvents() {
    return this.pubSub.asyncIterator<MatchmakingDomainEvent>(
      MATCHMAKING_CHANNEL,
    );
  }
}
