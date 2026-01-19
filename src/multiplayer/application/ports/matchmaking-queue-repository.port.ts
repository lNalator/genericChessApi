import { MatchmakingTicket } from '../../../domain/entities/matchmaking-ticket';
import { MatchProposal } from '../../../domain/entities/match-proposal';

export const MATCHMAKING_QUEUE_REPOSITORY = 'MATCHMAKING_QUEUE_REPOSITORY';

export interface MatchmakingQueueRepositoryPort {
  enqueue(ticket: MatchmakingTicket): void;
  takeCompatible(ticket: MatchmakingTicket): MatchmakingTicket | null;
  dequeue(clientId: string): MatchmakingTicket | null;
  findTicket(clientId: string): MatchmakingTicket | null;
  saveTicket(ticket: MatchmakingTicket): void;
  createProposal(proposal: MatchProposal): void;
  getProposal(matchId: string): MatchProposal | null;
  findProposalByClientId(clientId: string): MatchProposal | null;
  deleteProposal(matchId: string): MatchProposal | null;
  listTickets(): MatchmakingTicket[];
  purgeClient(clientId: string, resetTicket: (t: MatchmakingTicket) => MatchmakingTicket): MatchmakingTicket[];
}
