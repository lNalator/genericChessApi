import { Args, ID, Mutation, Query, Resolver, Subscription } from '@nestjs/graphql';
import { GameSessionService } from '../../application/services/game-session.service';
import { GameRuntimeService } from '../../application/services/game-runtime.service';
import { MatchmakingService } from '../../application/services/matchmaking.service';
import {
  GameEventDTO,
  GameSessionViewDTO,
  MakeMoveResponseDTO,
  OkResponseDTO,
  OfferDrawResponseDTO,
} from '../dtos/game-types.dto';
import {
  ClientReadyInputDTO,
  CreateInviteGameInputDTO,
  DequeueMatchmakingInputDTO,
  EnqueueMatchmakingInputDTO,
  JoinInviteGameInputDTO,
  MakeMoveInputDTO,
  NotifyDisconnectInputDTO,
  NotifyReconnectInputDTO,
  OfferDrawInputDTO,
  ResignInputDTO,
} from '../dtos/multiplayer-inputs.dto';
import {
  DequeueMatchmakingResponseDTO,
  EnqueueMatchmakingResponseDTO,
  MatchmakingEventDTO,
} from '../dtos/matchmaking-types.dto';
import { InviteGamePayloadDTO, JoinInviteGamePayloadDTO } from '../dtos/multiplayer-responses.dto';
import { TimeControlConfig } from '../../domain/types/time-control';
import { GameEventMapper } from '../mappers/game-event.mapper';
import { MatchmakingEventMapper } from '../mappers/matchmaking-event.mapper';
import { SessionMapper } from '../mappers/session.mapper';
import { ApolloDomainEventPublisherAdapter } from '../../infrastructure/pubsub/apollo-domain-event-publisher.adapter';
import { GameDomainEvent } from '../../domain/events/game-domain-event';
import { MatchmakingDomainEvent } from '../../domain/events/matchmaking-domain-event';

const envLogSubscriptions = () =>
  String(process.env.MULTIPLAYER_LOG_EVENTS).toLowerCase() === 'true';

type SubscriptionContext = {
  extra?: { [key: string]: unknown };
  connectionParams?: { [key: string]: unknown };
};

function resolveClientId(variables: any, context: SubscriptionContext): string | null {
  const varId = variables?.clientId;
  const extraId = (context?.extra as any)?.clientId;
  const paramId = (context?.connectionParams as any)?.clientId;
  return (varId as string) ?? (extraId as string) ?? (paramId as string) ?? null;
}

@Resolver()
export class MultiplayerResolver {
  constructor(
    private readonly sessions: GameSessionService,
    private readonly matchmaking: MatchmakingService,
    private readonly runtime: GameRuntimeService,
    private readonly publisher: ApolloDomainEventPublisherAdapter,
    private readonly sessionMapper: SessionMapper,
    private readonly gameEventMapper: GameEventMapper,
    private readonly matchmakingMapper: MatchmakingEventMapper,
  ) {}

  @Query(() => GameSessionViewDTO)
  gameState(
    @Args('gameId', { type: () => ID }) gameId: string,
    @Args('clientId', { type: () => ID }) clientId: string,
  ): GameSessionViewDTO {
    const { session } = this.sessions.getSession(gameId, clientId);
    return this.sessionMapper.toSessionView(session, clientId);
  }

  @Mutation(() => InviteGamePayloadDTO)
  createInviteGame(@Args('input') input: CreateInviteGameInputDTO): InviteGamePayloadDTO {
    const { session, playerColor } = this.sessions.createInviteGame({
      clientId: input.clientId,
      name: input.name,
      timeControl: this.toTimeControl(input.timeControl),
    });
    return { gameId: session.id, code: session.code ?? '', playerColor };
  }

  @Mutation(() => JoinInviteGamePayloadDTO)
  joinInviteGame(@Args('input') input: JoinInviteGameInputDTO): JoinInviteGamePayloadDTO {
    const { session, playerColor } = this.sessions.joinInviteGame({
      clientId: input.clientId,
      code: input.code,
      name: input.name,
    });
    return { gameId: session.id, playerColor };
  }

  @Mutation(() => EnqueueMatchmakingResponseDTO)
  enqueueMatchmaking(@Args('input') input: EnqueueMatchmakingInputDTO): EnqueueMatchmakingResponseDTO {
    const result = this.matchmaking.enqueue({
      clientId: input.clientId,
      name: input.name,
      timeControl: this.toTimeControl(input.timeControl),
    });
    return { queued: result.enqueued };
  }

  @Mutation(() => DequeueMatchmakingResponseDTO)
  dequeueMatchmaking(@Args('input') input: DequeueMatchmakingInputDTO): DequeueMatchmakingResponseDTO {
    const result = this.matchmaking.dequeue({ clientId: input.clientId });
    return { dequeued: result.dequeued };
  }

  @Mutation(() => MakeMoveResponseDTO)
  makeMove(@Args('input') input: MakeMoveInputDTO): MakeMoveResponseDTO {
    const session = this.runtime.makeMove({
      clientId: input.clientId,
      gameId: input.gameId,
      from: input.from,
      to: input.to,
      promotion: input.promotion,
    });
    return { ok: true, game: this.sessionMapper.toGameView(session) };
  }

  @Mutation(() => OkResponseDTO)
  clientReady(@Args('input') input: ClientReadyInputDTO): OkResponseDTO {
    const { ok } = this.runtime.clientReady({ clientId: input.clientId, gameId: input.gameId });
    return { ok };
  }

  @Mutation(() => OkResponseDTO)
  resign(@Args('input') input: ResignInputDTO): OkResponseDTO {
    this.runtime.resign({ clientId: input.clientId, gameId: input.gameId });
    return { ok: true };
  }

  @Mutation(() => OkResponseDTO)
  notifyDisconnect(@Args('input') input: NotifyDisconnectInputDTO): OkResponseDTO {
    this.runtime.notifyDisconnect(input.gameId, input.clientId);
    return { ok: true };
  }

  @Mutation(() => OkResponseDTO)
  notifyReconnect(@Args('input') input: NotifyReconnectInputDTO): OkResponseDTO {
    this.runtime.notifyReconnect(input.gameId, input.clientId);
    return { ok: true };
  }

  @Mutation(() => OfferDrawResponseDTO)
  offerDraw(@Args('input') input: OfferDrawInputDTO): OfferDrawResponseDTO {
    const result = this.runtime.offerDraw(input.gameId, input.clientId);
    return { ok: result.ok, accepted: result.accepted };
  }

  @Subscription(() => GameEventDTO, {
    filter: (payload: any, variables: any) => {
      if (!variables || !variables.gameId || !variables.clientId) return false;
      const ev: GameDomainEvent | undefined = payload?.gameEvent ?? payload;
      if (!ev || !ev.gameId) return false;
      if (ev.gameId !== variables.gameId) return false;
      if (ev.targetClientId && ev.targetClientId !== variables.clientId) return false;
      return true;
    },
    resolve: function (
      this: MultiplayerResolver,
      payload: any,
      variables: any,
      context: SubscriptionContext,
      info,
    ) {
      const ev: GameDomainEvent | undefined = payload?.gameEvent ?? payload;
      const shouldLog = Boolean((info?.rootValue as any)?.logSubscriptions ?? envLogSubscriptions());
      if (shouldLog) {
        // eslint-disable-next-line no-console
        console.log('[multiplayer][game-subscription][deliver]', {
          gameId: ev?.gameId,
          clientId: variables?.clientId,
          type: ev?.type,
        });
      }
      if (!ev || !ev.gameId) {
        return {
          type: 'ERROR_OCCURRED',
          at: new Date(),
          gameId: variables?.gameId ?? '',
          targetClientId: variables?.clientId ?? null,
          errorCode: 'INVALID_GAME_EVENT',
          message: 'Malformed game event payload',
        } as any;
      }
      return ev ? this.gameEventMapper.toDTO(ev) : ev;
    },
  })
  gameEvents(
    @Args('gameId', { type: () => ID }) gameId: string,
    @Args('clientId', { type: () => ID }) clientId: string,
  ) {
    return this.publisher.asyncIteratorGameEvents();
  }

  @Subscription(() => MatchmakingEventDTO, {
    filter: (payload: any, variables: any, context: SubscriptionContext) => {
      const targetClientId = resolveClientId(variables, context);
      if (!targetClientId) return false;
      const ev: MatchmakingDomainEvent | undefined = payload?.matchmakingEvent ?? payload;
      if (!ev || !ev.clientId) return false;
      return ev.clientId === targetClientId;
    },
    resolve: function (
      this: MultiplayerResolver,
      payload: any,
      variables: any,
      context: SubscriptionContext,
      info,
    ) {
      const ev: MatchmakingDomainEvent | undefined = payload?.matchmakingEvent ?? payload;
      const shouldLog = Boolean((info?.rootValue as any)?.logSubscriptions ?? envLogSubscriptions());
      if (shouldLog) {
        // eslint-disable-next-line no-console
        console.log('[multiplayer][matchmaking-subscription][deliver]', {
          clientId: resolveClientId(variables, context),
          type: ev?.type,
          matchId: ev?.matchId,
        });
      }
        if (!ev || !ev.clientId) {
          return {
            type: 'ERROR_OCCURRED',
            at: new Date(),
            clientId: resolveClientId(variables, context) ?? '',
            errorCode: 'INVALID_MATCHMAKING_EVENT',
            message: 'Malformed matchmaking event payload',
          } as any;
        }
        return ev ? this.matchmakingMapper.toDTO(ev) : ev;
    },
  })
  matchmakingEvents(@Args('clientId', { type: () => ID }) clientId: string) {
    return this.publisher.asyncIteratorMatchmakingEvents();
  }

  private toTimeControl(input: { initialSeconds: number; incrementSeconds: number }): TimeControlConfig {
    return {
      initialSeconds: input.initialSeconds,
      incrementSeconds: input.incrementSeconds,
    };
  }
}
