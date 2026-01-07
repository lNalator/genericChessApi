import { GameDomainEvent } from '../../domain/events/game-domain-event';
import { MatchmakingDomainEvent } from '../../domain/events/matchmaking-domain-event';

export const DOMAIN_EVENT_PUBLISHER = 'DOMAIN_EVENT_PUBLISHER';

export interface DomainEventPublisherPort {
  publishGameEvents(events: GameDomainEvent[]): void;
  publishMatchmakingEvents(events: MatchmakingDomainEvent[]): void;
}
