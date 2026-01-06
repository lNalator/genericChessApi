import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { EnqueueMatchmakingInput } from '../dto/game.inputs';
import { MatchmakingEventType, TimeControlInput } from '../dto/game.types';
import { TimeControlDomain } from './game-domain.service';

export type MatchmakingDomainEvent = {
  type: MatchmakingEventType;
  at: Date;
  clientId: string;
  matchId?: string | null;
  message?: string;
  errorCode?: string | null;
  deadlineAt?: Date | null;
  timeControl?: { initialSeconds: number; incrementSeconds: number } | null;
};

type MatchmakingEntry = {
  clientId: string;
  name?: string;
  timeControl: TimeControlDomain;
  enqueuedAt: number;
};

type PendingMatch = {
  matchId: string;
  a: MatchmakingEntry;
  b: MatchmakingEntry;
  deadlineMs: number;
  acceptedBy: Set<string>;
};

@Injectable()
export class MatchmakingDomainService {
  private readonly queue: MatchmakingEntry[] = [];
  private readonly matches = new Map<string, PendingMatch>();
  private readonly clientToMatchId = new Map<string, string>();

  enqueue(args: { input: EnqueueMatchmakingInput; acceptTimeoutSeconds: number }): {
    enqueued: boolean;
    events: MatchmakingDomainEvent[];
    matchCreated?: PendingMatch;
  } {
    const { input, acceptTimeoutSeconds } = args;
    const timeControl = this.normalizeTimeControl(input.timeControl);

    if (this.clientToMatchId.has(input.clientId)) {
      return {
        enqueued: false,
        events: [
          {
            type: MatchmakingEventType.ERROR,
            at: new Date(),
            clientId: input.clientId,
            errorCode: 'ALREADY_MATCH_PENDING',
            message: 'Already has a pending match',
          },
        ],
      };
    }

    const alreadyQueued = this.queue.some((e) => e.clientId === input.clientId);
    if (alreadyQueued) return { enqueued: true, events: [] };

    const opponentIndex = this.queue.findIndex((e) => this.timeControlKey(e.timeControl) === this.timeControlKey(timeControl));
    if (opponentIndex !== -1) {
      const opponent = this.queue.splice(opponentIndex, 1)[0];
      const entry: MatchmakingEntry = {
        clientId: input.clientId,
        name: input.name,
        timeControl,
        enqueuedAt: Date.now(),
      };

      const matchId = randomUUID();
      const now = Date.now();
      const deadlineMs = now + acceptTimeoutSeconds * 1000;
      const pending: PendingMatch = {
        matchId,
        a: opponent,
        b: entry,
        deadlineMs,
        acceptedBy: new Set<string>(),
      };
      this.matches.set(matchId, pending);
      this.clientToMatchId.set(opponent.clientId, matchId);
      this.clientToMatchId.set(entry.clientId, matchId);

      const tcPayload = { initialSeconds: timeControl.initialSeconds, incrementSeconds: timeControl.incrementSeconds };

      return {
        enqueued: false,
        matchCreated: pending,
        events: [
          {
            type: MatchmakingEventType.MATCH_FOUND,
            at: new Date(now),
            clientId: opponent.clientId,
            matchId,
            deadlineAt: new Date(deadlineMs),
            timeControl: tcPayload,
            message: 'Match found; waiting for accept',
          },
          {
            type: MatchmakingEventType.MATCH_FOUND,
            at: new Date(now),
            clientId: entry.clientId,
            matchId,
            deadlineAt: new Date(deadlineMs),
            timeControl: tcPayload,
            message: 'Match found; waiting for accept',
          },
        ],
      };
    }

    this.queue.push({
      clientId: input.clientId,
      name: input.name,
      timeControl,
      enqueuedAt: Date.now(),
    });

    return {
      enqueued: true,
      events: [
        {
          type: MatchmakingEventType.ENQUEUED,
          at: new Date(),
          clientId: input.clientId,
          timeControl: { initialSeconds: timeControl.initialSeconds, incrementSeconds: timeControl.incrementSeconds },
          message: 'Enqueued',
        },
      ],
    };
  }

  dequeue(clientId: string): { dequeued: boolean; events: MatchmakingDomainEvent[] } {
    const idx = this.queue.findIndex((e) => e.clientId === clientId);
    if (idx !== -1) {
      this.queue.splice(idx, 1);
      return {
        dequeued: true,
        events: [
          {
            type: MatchmakingEventType.DEQUEUED,
            at: new Date(),
            clientId,
            message: 'Dequeued',
          },
        ],
      };
    }

    const matchId = this.clientToMatchId.get(clientId);
    if (matchId) {
      const pending = this.matches.get(matchId);
      if (pending) {
        const other = pending.a.clientId === clientId ? pending.b.clientId : pending.a.clientId;
        this.matches.delete(matchId);
        this.clientToMatchId.delete(pending.a.clientId);
        this.clientToMatchId.delete(pending.b.clientId);

        // Put the other player back in the queue (self-healing).
        const otherEntry = pending.a.clientId === other ? pending.a : pending.b;
        if (!this.queue.some((e) => e.clientId === otherEntry.clientId)) {
          this.queue.push({ ...otherEntry, enqueuedAt: Date.now() });
        }

        return {
          dequeued: true,
          events: [
            {
              type: MatchmakingEventType.DEQUEUED,
              at: new Date(),
              clientId,
              message: 'Dequeued',
            },
            {
              type: MatchmakingEventType.MATCH_FAILED,
              at: new Date(),
              clientId: other,
              matchId,
              errorCode: 'OPPONENT_LEFT',
              message: 'Opponent left before accepting; continuing search',
            },
            {
              type: MatchmakingEventType.ENQUEUED,
              at: new Date(),
              clientId: other,
              timeControl: { initialSeconds: otherEntry.timeControl.initialSeconds, incrementSeconds: otherEntry.timeControl.incrementSeconds },
              message: 'Enqueued',
            },
          ],
        };
      }
    }

    return { dequeued: false, events: [] };
  }

  acceptMatch(args: { clientId: string; matchId: string }): {
    ok: boolean;
    events: MatchmakingDomainEvent[];
    readyMatch?: PendingMatch;
  } {
    const { clientId, matchId } = args;
    const pending = this.matches.get(matchId);
    if (!pending) throw new BadRequestException('Match not found');
    if (pending.a.clientId !== clientId && pending.b.clientId !== clientId) {
      throw new BadRequestException('Not part of this match');
    }

    if (Date.now() > pending.deadlineMs) {
      this.cancelMatch(matchId);
      return {
        ok: false,
        events: [
          {
            type: MatchmakingEventType.MATCH_FAILED,
            at: new Date(),
            clientId,
            matchId,
            errorCode: 'MATCH_EXPIRED',
            message: 'Match accept window expired',
          },
        ],
      };
    }

    pending.acceptedBy.add(clientId);

    const bothAccepted =
      pending.acceptedBy.has(pending.a.clientId) && pending.acceptedBy.has(pending.b.clientId);

    if (!bothAccepted) return { ok: true, events: [] };

    // Remove match; the caller (adapter) will create a game.
    this.matches.delete(matchId);
    this.clientToMatchId.delete(pending.a.clientId);
    this.clientToMatchId.delete(pending.b.clientId);

    return { ok: true, events: [], readyMatch: pending };
  }

  handleClientDisconnected(clientId: string): { events: MatchmakingDomainEvent[] } {
    // Remove from queue.
    const idx = this.queue.findIndex((e) => e.clientId === clientId);
    if (idx !== -1) {
      this.queue.splice(idx, 1);
      return { events: [] };
    }

    // Cancel pending match and requeue the opponent.
    const matchId = this.clientToMatchId.get(clientId);
    if (!matchId) return { events: [] };
    const pending = this.matches.get(matchId);
    if (!pending) return { events: [] };

    const other = pending.a.clientId === clientId ? pending.b.clientId : pending.a.clientId;
    const otherEntry = pending.a.clientId === other ? pending.a : pending.b;

    this.cancelMatch(matchId);

    if (!this.queue.some((e) => e.clientId === otherEntry.clientId)) {
      this.queue.push({ ...otherEntry, enqueuedAt: Date.now() });
    }

    return {
      events: [
        {
          type: MatchmakingEventType.MATCH_FAILED,
          at: new Date(),
          clientId: other,
          matchId,
          errorCode: 'OPPONENT_DISCONNECTED',
          message: 'Opponent disconnected before accepting; continuing search',
        },
        {
          type: MatchmakingEventType.ENQUEUED,
          at: new Date(),
          clientId: other,
          timeControl: { initialSeconds: otherEntry.timeControl.initialSeconds, incrementSeconds: otherEntry.timeControl.incrementSeconds },
          message: 'Enqueued',
        },
      ],
    };
  }

  expireMatch(matchId: string): { events: MatchmakingDomainEvent[] } {
    const pending = this.matches.get(matchId);
    if (!pending) return { events: [] };

    this.cancelMatch(matchId);

    const now = new Date();
    const tc = { initialSeconds: pending.a.timeControl.initialSeconds, incrementSeconds: pending.a.timeControl.incrementSeconds };

    const aEvents: MatchmakingDomainEvent[] = [
      {
        type: MatchmakingEventType.MATCH_FAILED,
        at: now,
        clientId: pending.a.clientId,
        matchId,
        errorCode: 'MATCH_EXPIRED',
        message: 'Match accept window expired; continuing search',
      },
      {
        type: MatchmakingEventType.ENQUEUED,
        at: now,
        clientId: pending.a.clientId,
        timeControl: tc,
        message: 'Enqueued',
      },
    ];

    const bEvents: MatchmakingDomainEvent[] = [
      {
        type: MatchmakingEventType.MATCH_FAILED,
        at: now,
        clientId: pending.b.clientId,
        matchId,
        errorCode: 'MATCH_EXPIRED',
        message: 'Match accept window expired; continuing search',
      },
      {
        type: MatchmakingEventType.ENQUEUED,
        at: now,
        clientId: pending.b.clientId,
        timeControl: tc,
        message: 'Enqueued',
      },
    ];

    // Requeue both (self-healing).
    if (!this.queue.some((e) => e.clientId === pending.a.clientId)) {
      this.queue.push({ ...pending.a, enqueuedAt: Date.now() });
    }
    if (!this.queue.some((e) => e.clientId === pending.b.clientId)) {
      this.queue.push({ ...pending.b, enqueuedAt: Date.now() });
    }

    return { events: [...aEvents, ...bEvents] };
  }

  cancelMatch(matchId: string) {
    const pending = this.matches.get(matchId);
    if (!pending) return;
    this.matches.delete(matchId);
    this.clientToMatchId.delete(pending.a.clientId);
    this.clientToMatchId.delete(pending.b.clientId);
  }

  private normalizeTimeControl(input: TimeControlInput): TimeControlDomain {
    const initialSeconds = Math.max(1, Math.floor(input.initialSeconds));
    const incrementSeconds = input.incrementSeconds ? Math.max(0, Math.floor(input.incrementSeconds)) : 0;
    return { initialSeconds, incrementSeconds };
  }

  private timeControlKey(tc: TimeControlDomain) {
    return `${tc.initialSeconds}+${tc.incrementSeconds}`;
  }
}
