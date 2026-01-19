import { Injectable } from '@nestjs/common';
import { MatchmakingQueueRepositoryPort } from '../../application/ports/matchmaking-queue-repository.port';
import { MatchProposal } from '../../../domain/entities/match-proposal';
import { MatchmakingTicket } from '../../../domain/entities/matchmaking-ticket';
import { timeControlKey } from '../../../domain/types/time-control';
import { MatchmakingState } from '../../../domain/types/matchmaking-state.enum';
import { MatchmakingTransitionType, applyMatchmakingTransition } from '../../../domain/state-machines/matchmaking-state-machine';

@Injectable()
export class InMemoryMatchmakingQueueRepository implements MatchmakingQueueRepositoryPort {
  private readonly queue: MatchmakingTicket[] = [];
  private readonly tickets = new Map<string, MatchmakingTicket>();
  private readonly proposals = new Map<string, MatchProposal>();
  private readonly maxQueueAgeMs = 30_000;

  private pruneExpired(now: number) {
    for (const [clientId, ticket] of [...this.tickets.entries()]) {
      if (now - ticket.enqueuedAt > this.maxQueueAgeMs) {
        this.tickets.delete(clientId);
        const idx = this.queue.findIndex((t) => t.clientId === clientId);
        if (idx !== -1) this.queue.splice(idx, 1);
      }
    }
  }

  enqueue(ticket: MatchmakingTicket): void {
    this.pruneExpired(Date.now());
    this.queue.push(ticket);
    this.tickets.set(ticket.clientId, ticket);
  }

  takeCompatible(ticket: MatchmakingTicket): MatchmakingTicket | null {
    this.pruneExpired(Date.now());
    const key = timeControlKey(ticket.timeControl);
    const index = this.queue.findIndex(
      (entry) => entry.clientId !== ticket.clientId && timeControlKey(entry.timeControl) === key,
    );
    if (index === -1) return null;
    const [match] = this.queue.splice(index, 1);
    return match;
  }

  dequeue(clientId: string): MatchmakingTicket | null {
    const index = this.queue.findIndex((entry) => entry.clientId === clientId);
    if (index !== -1) {
      const [ticket] = this.queue.splice(index, 1);
      this.tickets.delete(clientId);
      return ticket;
    }

    const ticket = this.tickets.get(clientId);
    if (ticket) {
      this.tickets.delete(clientId);
    }
    return ticket ?? null;
  }

  findTicket(clientId: string): MatchmakingTicket | null {
    this.pruneExpired(Date.now());
    return this.tickets.get(clientId) ?? null;
  }

  saveTicket(ticket: MatchmakingTicket): void {
    this.tickets.set(ticket.clientId, ticket);
  }

  createProposal(proposal: MatchProposal): void {
    this.proposals.set(proposal.matchId, proposal);
    this.tickets.set(proposal.a.clientId, proposal.a);
    this.tickets.set(proposal.b.clientId, proposal.b);
  }

  getProposal(matchId: string): MatchProposal | null {
    return this.proposals.get(matchId) ?? null;
  }

  findProposalByClientId(clientId: string): MatchProposal | null {
    for (const proposal of this.proposals.values()) {
      if (proposal.a.clientId === clientId || proposal.b.clientId === clientId) {
        return proposal;
      }
    }
    return null;
  }

  deleteProposal(matchId: string): MatchProposal | null {
    const proposal = this.proposals.get(matchId);
    if (!proposal) return null;
    this.proposals.delete(matchId);
    return proposal;
  }

  listTickets(): MatchmakingTicket[] {
    return [...this.tickets.values()];
  }

  purgeClient(clientId: string, resetTicket: (t: MatchmakingTicket) => MatchmakingTicket): MatchmakingTicket[] {
    const toRequeue: MatchmakingTicket[] = [];
    // Remove from active proposal, requeue opponent
    for (const [matchId, proposal] of [...this.proposals.entries()]) {
      if (proposal.a.clientId === clientId || proposal.b.clientId === clientId) {
        const other = proposal.a.clientId === clientId ? proposal.b : proposal.a;
        this.proposals.delete(matchId);
        const reset = resetTicket({
          ...other,
          state: applyMatchmakingTransition(MatchmakingState.IDLE, { type: MatchmakingTransitionType.ENQUEUE }),
          matchId: null,
          assignedColor: null,
          assignedGameId: null,
          proposalDeadlineMs: null,
          enqueuedAt: Date.now(),
        });
        this.enqueue(reset);
        toRequeue.push(reset);
      }
    }

    // Remove any queued ticket
    const idx = this.queue.findIndex((t) => t.clientId === clientId);
    if (idx !== -1) this.queue.splice(idx, 1);
    this.tickets.delete(clientId);

    return toRequeue;
  }
}
