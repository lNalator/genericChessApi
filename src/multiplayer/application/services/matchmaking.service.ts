import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { randomInt } from 'crypto';
import { MatchmakingTicket } from '../../domain/entities/matchmaking-ticket';
import { MatchmakingDomainEvent, MatchmakingDomainEventType } from '../../domain/events/matchmaking-domain-event';
import { ColorEnum } from '../../domain/engine/enums/color.enum';
import { MatchmakingState } from '../../domain/types/matchmaking-state.enum';
import { normalizeTimeControl } from '../../domain/types/time-control';
import {
  MatchmakingTransitionType,
  applyMatchmakingTransition,
} from '../../domain/state-machines/matchmaking-state-machine';
import { EnqueueMatchmakingCommand } from '../commands/enqueue-matchmaking.command';
import { DequeueMatchmakingCommand } from '../commands/dequeue-matchmaking.command';
import { GameSessionService } from './game-session.service';
import { CODE_GENERATOR_PORT, CodeGeneratorPort } from '../ports/code-generator.port';
import { DOMAIN_EVENT_PUBLISHER, DomainEventPublisherPort } from '../ports/domain-event-publisher.port';
import { MATCHMAKING_QUEUE_REPOSITORY, MatchmakingQueueRepositoryPort } from '../ports/matchmaking-queue-repository.port';
import { GameRuntimeService } from './game-runtime.service';

type EnqueueResult = { enqueued: boolean };
type DequeueResult = { dequeued: boolean };

@Injectable()
export class MatchmakingService {
  constructor(
    @Inject(MATCHMAKING_QUEUE_REPOSITORY) private readonly queue: MatchmakingQueueRepositoryPort,
    @Inject(DOMAIN_EVENT_PUBLISHER) private readonly publisher: DomainEventPublisherPort,
    @Inject(CODE_GENERATOR_PORT) private readonly codeGen: CodeGeneratorPort,
    private readonly gameSessions: GameSessionService,
    private readonly runtime: GameRuntimeService,
  ) {}

  enqueue(cmd: EnqueueMatchmakingCommand): EnqueueResult {
    this.ensureClientId(cmd.clientId);
    const existing = this.queue.findTicket(cmd.clientId);
    if (existing) {
      // Force-purge stale ticket/proposals then continue as fresh enqueue.
      this.queue.purgeClient(cmd.clientId, (t) => t);
    }

    const timeControl = normalizeTimeControl(cmd.timeControl);
    const baseTicket: MatchmakingTicket = {
      clientId: cmd.clientId,
      name: cmd.name ?? 'Player',
      timeControl,
      state: applyMatchmakingTransition(MatchmakingState.IDLE, { type: MatchmakingTransitionType.ENQUEUE }),
      enqueuedAt: Date.now(),
      matchId: null,
      assignedColor: null,
      assignedGameId: null,
      proposalDeadlineMs: null,
    };

    const opponent = this.queue.takeCompatible(baseTicket);
    if (!opponent) {
      this.queue.enqueue(baseTicket);
      this.queue.saveTicket(baseTicket);
      this.publisher.publishMatchmakingEvents([
        {
          type: MatchmakingDomainEventType.PLAYER_ENQUEUED,
          at: new Date(),
          clientId: cmd.clientId,
          timeControl,
          message: 'Enqueued for matchmaking',
        },
      ]);
      return { enqueued: true };
    }

    const matchId = this.codeGen.generateMatchId();
    baseTicket.state = applyMatchmakingTransition(baseTicket.state, {
      type: MatchmakingTransitionType.PROPOSE_MATCH,
    });
    opponent.state = applyMatchmakingTransition(opponent.state, {
      type: MatchmakingTransitionType.PROPOSE_MATCH,
    });
    baseTicket.matchId = matchId;
    opponent.matchId = matchId;

    const firstIsWhite = randomInt(0, 2) === 0;
    const whiteTicket = firstIsWhite ? baseTicket : opponent;
    const blackTicket = firstIsWhite ? opponent : baseTicket;

    const session = this.gameSessions.createMatchSession({
      white: { clientId: whiteTicket.clientId, name: whiteTicket.name },
      black: { clientId: blackTicket.clientId, name: blackTicket.name },
      timeControl,
    });

    const deadlineMs = session.readyCheck?.deadlineAt?.getTime() ?? null;
    whiteTicket.assignedColor = ColorEnum.WHITE;
    blackTicket.assignedColor = ColorEnum.BLACK;
    whiteTicket.assignedGameId = session.id;
    blackTicket.assignedGameId = session.id;
    whiteTicket.proposalDeadlineMs = deadlineMs;
    blackTicket.proposalDeadlineMs = deadlineMs;
    whiteTicket.state = applyMatchmakingTransition(whiteTicket.state, { type: MatchmakingTransitionType.READY });
    blackTicket.state = applyMatchmakingTransition(blackTicket.state, { type: MatchmakingTransitionType.READY });

    this.queue.saveTicket(whiteTicket);
    this.queue.saveTicket(blackTicket);
    this.queue.createProposal({ matchId, a: whiteTicket, b: blackTicket, deadlineMs: deadlineMs ?? Date.now() });

    this.publishMatchProposal(whiteTicket, matchId, ColorEnum.WHITE, session.id);
    this.publishMatchProposal(blackTicket, matchId, ColorEnum.BLACK, session.id);

    // Auto-ready both players to avoid ready-timeout when clients are slow to subscribe.
    try {
      this.runtime.clientReady({ gameId: session.id, clientId: whiteTicket.clientId });
      this.runtime.clientReady({ gameId: session.id, clientId: blackTicket.clientId });
    } catch (e) {
      // ignore; ready timeout will fire if something goes wrong
    }

    return { enqueued: false };
  }

  dequeue(cmd: DequeueMatchmakingCommand): DequeueResult {
    this.ensureClientId(cmd.clientId);

    const proposal = this.queue.findProposalByClientId(cmd.clientId);
    if (proposal) {
      this.queue.deleteProposal(proposal.matchId);
      const remaining = proposal.a.clientId === cmd.clientId ? proposal.b : proposal.a;
      const resetTicket: MatchmakingTicket = {
        ...remaining,
        state: applyMatchmakingTransition(MatchmakingState.IDLE, { type: MatchmakingTransitionType.ENQUEUE }),
        matchId: null,
        assignedColor: null,
        assignedGameId: null,
        proposalDeadlineMs: null,
        enqueuedAt: Date.now(),
      };
      this.queue.enqueue(resetTicket);
      this.queue.saveTicket(resetTicket);
      this.publisher.publishMatchmakingEvents([
        {
          type: MatchmakingDomainEventType.PLAYER_DEQUEUED,
          at: new Date(),
          clientId: cmd.clientId,
          message: 'Dequeued from match proposal',
        },
        {
          type: MatchmakingDomainEventType.MATCH_FAILED,
          at: new Date(),
          clientId: remaining.clientId,
          matchId: proposal.matchId,
          message: 'Opponent left proposal; re-queued',
          timeControl: remaining.timeControl,
        },
        {
          type: MatchmakingDomainEventType.PLAYER_ENQUEUED,
          at: new Date(),
          clientId: remaining.clientId,
          timeControl: remaining.timeControl,
          message: 'Re-queued after failed match',
        },
      ]);
      return { dequeued: true };
    }

    const removed = this.queue.dequeue(cmd.clientId);
    if (!removed) return { dequeued: false };

    this.publisher.publishMatchmakingEvents([
      {
        type: MatchmakingDomainEventType.PLAYER_DEQUEUED,
        at: new Date(),
        clientId: cmd.clientId,
        message: 'Dequeued',
      },
    ]);
    return { dequeued: true };
  }

  private publishMatchProposal(ticket: MatchmakingTicket, matchId: string, color: ColorEnum, gameId: string) {
    const event: MatchmakingDomainEvent = {
      type: MatchmakingDomainEventType.MATCH_PROPOSED,
      at: new Date(),
      clientId: ticket.clientId,
      matchId,
      gameId,
      playerColor: color,
      timeControl: ticket.timeControl,
      deadlineAt: ticket.proposalDeadlineMs ? new Date(ticket.proposalDeadlineMs) : null,
      message: 'Match found - load session',
    };
    this.publisher.publishMatchmakingEvents([event]);
  }

  private publishError(clientId: string, code: string, message: string) {
    this.publisher.publishMatchmakingEvents([
      {
        type: MatchmakingDomainEventType.ERROR_OCCURRED,
        at: new Date(),
        clientId,
        errorCode: code,
        message,
      },
    ]);
  }

  private ensureClientId(clientId: string) {
    if (!clientId || typeof clientId !== 'string') {
      throw new BadRequestException('clientId is required');
    }
  }
}
