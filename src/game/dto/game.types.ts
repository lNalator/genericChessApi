import { Field, ID, InputType, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { GraphQLISODateTime } from '@nestjs/graphql';
import { ColorEnum } from '../engine/enums/color.enum';

registerEnumType(ColorEnum, { name: 'Color' });

export enum GameStatus {
  WAITING_FOR_PLAYERS = 'WAITING_FOR_PLAYERS',
  IN_PROGRESS = 'IN_PROGRESS',
  ENDED = 'ENDED',
}

registerEnumType(GameStatus, { name: 'GameStatus' });

@ObjectType()
export class Position {
  @Field(() => Int)
  vertical!: number;

  @Field(() => Int)
  horizontal!: number;
}

@InputType()
export class PositionInput {
  @Field(() => Int)
  vertical!: number;

  @Field(() => Int)
  horizontal!: number;
}

@ObjectType()
export class Piece {
  @Field()
  id!: string;

  @Field()
  name!: string;

  @Field(() => ColorEnum)
  color!: ColorEnum;

  @Field(() => Position)
  position!: Position;

  @Field()
  isAlive!: boolean;

  @Field(() => Int, { nullable: true })
  value?: number;

  @Field({ nullable: true })
  isFirstMove?: boolean;

  @Field({ nullable: true })
  doubleJump?: boolean;

  @Field({ nullable: true })
  isChecked?: boolean;
}

@ObjectType()
export class Player {
  @Field(() => ID)
  id!: string;

  @Field()
  name!: string;

  @Field(() => ColorEnum)
  color!: ColorEnum;

  @Field(() => Int)
  score!: number;

  @Field()
  isPlaying!: boolean;

  @Field(() => Int)
  time!: number;

  @Field(() => [Piece])
  pieces!: Piece[];

  @Field(() => [Piece])
  eatenPieces!: Piece[];

  @Field()
  askedDraw!: boolean;
}

@ObjectType()
export class GameOverReason {
  @Field({ nullable: true })
  checkmate?: boolean;

  @Field({ nullable: true })
  stalemate?: boolean;

  @Field({ nullable: true })
  insufficientMaterial?: boolean;

  @Field({ nullable: true })
  repetition?: boolean;

  @Field({ nullable: true })
  draw?: boolean;

  @Field({ nullable: true })
  resign?: boolean;

  @Field({ nullable: true })
  timeout?: boolean;

  @Field({ nullable: true })
  agreement?: boolean;
}

@ObjectType()
export class GameState {
  @Field(() => [Player])
  players!: Player[];

  @Field()
  hasGameEnded!: boolean;

  @Field(() => Player, { nullable: true })
  winner!: Player | null;

  @Field(() => GameOverReason)
  reason!: GameOverReason;
}

@ObjectType()
export class Game {
  @Field(() => ID)
  id!: string;

  @Field(() => GameStatus)
  status!: GameStatus;

  @Field(() => [Player])
  players!: Player[];

  @Field(() => String, { nullable: true })
  boardFen?: string | null;

  @Field(() => ColorEnum)
  turnColor!: ColorEnum;

  @Field(() => GraphQLISODateTime)
  createdAt!: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt!: Date;

  @Field(() => GameState)
  state!: GameState;
}

export enum GameEventType {
  PLAYER_JOINED = 'PLAYER_JOINED',
  PLAYER_LEFT = 'PLAYER_LEFT',
  MOVE_PLAYED = 'MOVE_PLAYED',
  GAME_STARTED = 'GAME_STARTED',
  GAME_ENDED = 'GAME_ENDED',
}

registerEnumType(GameEventType, { name: 'GameEventType' });

@ObjectType()
export class Move {
  @Field(() => Position)
  from!: Position;

  @Field(() => Position)
  to!: Position;

  @Field({ nullable: true })
  promotion?: string;

  @Field(() => GraphQLISODateTime)
  playedAt!: Date;

  @Field(() => ID)
  byPlayerId!: string;
}

@ObjectType()
export class GameEvent {
  @Field(() => GameEventType)
  type!: GameEventType;

  @Field(() => ID)
  gameId!: string;

  @Field(() => GraphQLISODateTime)
  at!: Date;

  @Field(() => Game)
  game!: Game;

  @Field(() => Move, { nullable: true })
  move?: Move;

  @Field(() => Player, { nullable: true })
  player?: Player;
}

