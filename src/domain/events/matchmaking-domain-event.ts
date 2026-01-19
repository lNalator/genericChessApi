import { ColorEnum } from '../engine/enums/color.enum';
import { TimeControlConfig } from '../types/time-control';

export enum MatchmakingDomainEventType {
  PLAYER_ENQUEUED = 'PLAYER_ENQUEUED',
  PLAYER_DEQUEUED = 'PLAYER_DEQUEUED',
  MATCH_PROPOSED = 'MATCH_PROPOSED',
  MATCH_CONFIRMED = 'MATCH_CONFIRMED',
  MATCH_FAILED = 'MATCH_FAILED',
  ERROR_OCCURRED = 'ERROR_OCCURRED',
}

export type MatchmakingDomainEvent = {
  type: MatchmakingDomainEventType;
  at: Date;
  clientId: string;
  matchId?: string | null;
  gameId?: string | null;
  playerColor?: ColorEnum | null;
  message?: string;
  timeControl?: TimeControlConfig | null;
  deadlineAt?: Date | null;
  errorCode?: string | null;
};
