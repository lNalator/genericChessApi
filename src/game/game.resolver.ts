import { Args, ID, Mutation, Query, Resolver, Subscription } from '@nestjs/graphql';
import { PubSub } from 'graphql-subscriptions';
import { CreateGameInput, JoinGameInput, LeaveGameInput, MoveInput } from './dto/game.inputs';
import { Game, GameEvent } from './dto/game.types';
import { GAME_EVENTS_TOPIC, GameService } from './game.service';

@Resolver(() => Game)
export class GameResolver {
  constructor(
    private readonly gameService: GameService,
    private readonly pubSub: PubSub,
  ) {}

  @Query(() => Game)
  game(@Args('gameId', { type: () => ID }) gameId: string): Game {
    return this.gameService.getGame(gameId);
  }

  @Mutation(() => Game)
  createGame(@Args('input') input: CreateGameInput): Game {
    return this.gameService.createGame(input);
  }

  @Mutation(() => Game)
  joinGame(
    @Args('gameId', { type: () => ID }) gameId: string,
    @Args('input') input: JoinGameInput,
  ): Game {
    return this.gameService.joinGame(gameId, input);
  }

  @Mutation(() => Game)
  leaveGame(
    @Args('gameId', { type: () => ID }) gameId: string,
    @Args('input') input: LeaveGameInput,
  ): Game {
    return this.gameService.leaveGame(gameId, input);
  }

  @Mutation(() => Game)
  makeMove(
    @Args('gameId', { type: () => ID }) gameId: string,
    @Args('input') input: MoveInput,
  ): Game {
    return this.gameService.makeMove(gameId, input);
  }

  @Subscription(() => GameEvent, {
    filter: (payload: any, variables: any) => payload.gameEvents.gameId === variables.gameId,
    resolve: (payload: any) => payload.gameEvents,
  })
  gameEvents(@Args('gameId', { type: () => ID }) _gameId: string) {
    return (this.pubSub as any).asyncIterator(GAME_EVENTS_TOPIC);
  }
}
