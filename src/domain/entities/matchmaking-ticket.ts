import { ColorEnum } from '../engine/enums/color.enum';
import { MatchmakingState } from '../types/matchmaking-state.enum';
import { TimeControlConfig } from '../types/time-control';

export type MatchmakingTicket = {
  clientId: string;
  name: string;
  timeControl: TimeControlConfig;
  state: MatchmakingState;
  enqueuedAt: number;
  matchId?: string | null;
  assignedGameId?: string | null;
  assignedColor?: ColorEnum | null;
  proposalDeadlineMs?: number | null;
};
