import { Args, ID, Mutation, Query, Resolver, Subscription } from '@nestjs/graphql';
import { withFilter } from 'graphql-subscriptions';
import {
  AcceptMatchInput,
  ClientReadyInput,
  CreateInviteGameInput,
  DequeueMatchmakingInput,
  EnqueueMatchmakingInput,
  JoinInviteGameInput,
  MakeMoveOnlineInput,
  QuitGameInput,
  RequestRematchInput,
  RespondRematchInput,
} from './dto/game.inputs';
import {
  Game,
  GameEvent,
  GameSession,
  MatchmakingEvent,
  OkResponse,
} from './dto/game.types';
import { DequeueMatchmakingResponse, EnqueueMatchmakingResponse } from './dto/game.types';
import { GameDomainService } from './domain/game-domain.service';
import { GameEventBusService } from './realtime/game-event-bus.service';
import { GameRealtimeService } from './realtime/game-realtime.service';

@Resolver()
export class GameResolver {
  constructor(
    private readonly gameRealtime: GameRealtimeService,
    private readonly gameDomain: GameDomainService,
    private readonly bus: GameEventBusService,
  ) {}

  @Query(() => GameSession)
  game(
    @Args('gameId', { type: () => ID }) gameId: string,
    @Args('clientId', { type: () => ID }) clientId: string,
  ): GameSession {
    return this.gameRealtime.getGameSession(gameId, clientId);
  }

  @Mutation(() => GameSession)
  createInviteGame(@Args('input') input: CreateInviteGameInput): GameSession {
    return this.gameRealtime.createInviteGame(input);
  }

  @Mutation(() => GameSession)
  joinInviteGame(@Args('input') input: JoinInviteGameInput): GameSession {
    return this.gameRealtime.joinInviteGame(input);
  }

  @Mutation(() => EnqueueMatchmakingResponse)
  enqueueMatchmaking(@Args('input') input: EnqueueMatchmakingInput): EnqueueMatchmakingResponse {
    return this.gameRealtime.enqueueMatchmaking(input);
  }

  @Mutation(() => DequeueMatchmakingResponse)
  dequeueMatchmaking(@Args('input') input: DequeueMatchmakingInput): DequeueMatchmakingResponse {
    return this.gameRealtime.dequeueMatchmaking(input.clientId);
  }

  @Mutation(() => Game)
  makeMove(@Args('input') input: MakeMoveOnlineInput): Game {
    return this.gameRealtime.makeMove(input);
  }

  @Mutation(() => OkResponse)
  clientReady(@Args('input') input: ClientReadyInput): OkResponse {
    return this.gameRealtime.clientReady(input.gameId, input.clientId);
  }

  @Mutation(() => OkResponse)
  requestRematch(@Args('input') input: RequestRematchInput): OkResponse {
    return this.gameRealtime.requestRematch(input);
  }

  @Mutation(() => OkResponse)
  respondRematch(@Args('input') input: RespondRematchInput): OkResponse {
    return this.gameRealtime.respondRematch(input);
  }

  @Mutation(() => OkResponse)
  acceptMatch(@Args('input') input: AcceptMatchInput): OkResponse {
    return this.gameRealtime.acceptMatch(input.clientId, input.matchId);
  }

  @Mutation(() => OkResponse)
  quitGame(@Args('input') input: QuitGameInput): OkResponse {
    return this.gameRealtime.quitGame(input);
  }

  @Subscription(() => GameEvent, { resolve: (payload: any) => payload.gameEvents })
  gameEvents(
    @Args('gameId', { type: () => ID }) _gameId: string,
    @Args('clientId', { type: () => ID }) _clientId: string,
  ) {
    return withFilter(
      () => this.bus.asyncIteratorGameEvents(),
      (payload: any, variables: any) => {
        const event = payload?.gameEvents;
        if (!event) return false;
        const gameId = variables?.gameId;
        const clientId = variables?.clientId;
        if (typeof gameId !== 'string' || typeof clientId !== 'string') return false;
        if (event.gameId !== gameId) return false;
        if (event.targetClientId && event.targetClientId !== clientId) return false;
        return this.gameDomain.isClientInGame(gameId, clientId);
      },
    )();
  }

  @Subscription(() => MatchmakingEvent, {
    resolve: (payload: any) => payload.matchmakingEvents,
  })
  matchmakingEvents(@Args('clientId', { type: () => ID }) clientId: string) {
    return this.bus.asyncIteratorMatchmaking(clientId);
  }
}
