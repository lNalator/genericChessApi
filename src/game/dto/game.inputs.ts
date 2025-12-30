import { Field, ID, InputType, Int } from '@nestjs/graphql';
import { PositionInput } from './game.types';

@InputType()
export class CreateGameInput {
  @Field(() => ID)
  playerId!: string;

  @Field({ nullable: true })
  name?: string;

  @Field(() => Int, { nullable: true, description: 'Client-side only for now.' })
  timeLimitSeconds?: number;
}

@InputType()
export class JoinGameInput {
  @Field(() => ID)
  playerId!: string;

  @Field({ nullable: true })
  name?: string;
}

@InputType()
export class LeaveGameInput {
  @Field(() => ID)
  playerId!: string;
}

@InputType()
export class MoveInput {
  @Field(() => ID)
  playerId!: string;

  @Field(() => PositionInput)
  from!: PositionInput;

  @Field(() => PositionInput)
  to!: PositionInput;

  @Field({ nullable: true })
  promotion?: string;
}

