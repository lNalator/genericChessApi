import { Args, ID, Mutation, Query, Resolver, Subscription } from '@nestjs/graphql';
import { withFilter } from 'graphql-subscriptions';
import {
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
  DequeueMatchmakingResponse,
  EnqueueMatchmakingResponse,
  Game,
  GameEvent,
  GameSession,
  MatchmakingEvent,
  OkResponse,
} from './dto/game.types';
import { GameService } from './game.service';

@Resolver()
export class GameResolver {
  constructor(private readonly gameService: GameService) {}

  @Query(() => GameSession)
  game(
    @Args('gameId', { type: () => ID }) gameId: string,
    @Args('clientId', { type: () => ID }) clientId: string,
  ): GameSession {
    return this.gameService.getGameSession(gameId, clientId);
  }

  @Mutation(() => GameSession)
  createInviteGame(@Args('input') input: CreateInviteGameInput): GameSession {
    return this.gameService.createInviteGame(input);
  }

  @Mutation(() => GameSession)
  joinInviteGame(@Args('input') input: JoinInviteGameInput): GameSession {
    return this.gameService.joinInviteGame(input);
  }

  @Mutation(() => EnqueueMatchmakingResponse)
  enqueueMatchmaking(@Args('input') input: EnqueueMatchmakingInput): EnqueueMatchmakingResponse {
    return this.gameService.enqueueMatchmaking(input);
  }

  @Mutation(() => DequeueMatchmakingResponse)
  dequeueMatchmaking(@Args('input') input: DequeueMatchmakingInput): DequeueMatchmakingResponse {
    return this.gameService.dequeueMatchmaking(input);
  }

  @Mutation(() => Game)
  makeMove(@Args('input') input: MakeMoveOnlineInput): Game {
    return this.gameService.makeMoveOnline(input);
  }

  @Mutation(() => OkResponse)
  requestRematch(@Args('input') input: RequestRematchInput): OkResponse {
    return this.gameService.requestRematch(input);
  }

  @Mutation(() => OkResponse)
  respondRematch(@Args('input') input: RespondRematchInput): OkResponse {
    return this.gameService.respondRematch(input);
  }

  @Mutation(() => OkResponse)
  quitGame(@Args('input') input: QuitGameInput): OkResponse {
    return this.gameService.quitGame(input);
  }

  @Subscription(() => GameEvent, { resolve: (payload: any) => payload.gameEvents })
  gameEvents(
    @Args('gameId', { type: () => ID }) _gameId: string,
    @Args('clientId', { type: () => ID }) _clientId: string,
  ) {
    return withFilter(
      () => this.gameService.asyncIteratorGameEvents(),
      (payload: any, variables: any) =>
        payload.gameEvents.gameId === variables.gameId &&
        this.gameService.isClientInGame(variables.gameId, variables.clientId),
    )();
  }

  @Subscription(() => MatchmakingEvent, {
    resolve: (payload: any) => payload.matchmakingEvents,
  })
  matchmakingEvents(@Args('clientId', { type: () => ID }) clientId: string) {
    return this.gameService.asyncIteratorMatchmaking(clientId);
  }
}
