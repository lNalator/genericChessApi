import { MatchmakingTicket } from './matchmaking-ticket';

export type MatchProposal = {
  matchId: string;
  a: MatchmakingTicket;
  b: MatchmakingTicket;
  deadlineMs: number;
};
