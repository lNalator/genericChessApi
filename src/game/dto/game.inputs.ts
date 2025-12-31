import { Field, ID, InputType } from '@nestjs/graphql';
import { PositionInput, TimeControlInput } from './game.types';

@InputType()
export class CreateGameInput {
  @Field(() => ID)
  playerId!: string;

  @Field({ nullable: true })
  name?: string;
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

@InputType()
export class CreateInviteGameInput {
  @Field(() => ID)
  clientId!: string;

  @Field(() => TimeControlInput)
  timeControl!: TimeControlInput;

  @Field({ nullable: true })
  name?: string;
}

@InputType()
export class JoinInviteGameInput {
  @Field(() => ID)
  clientId!: string;

  @Field()
  code!: string;

  @Field({ nullable: true })
  name?: string;
}

@InputType()
export class EnqueueMatchmakingInput {
  @Field(() => ID)
  clientId!: string;

  @Field(() => TimeControlInput)
  timeControl!: TimeControlInput;

  @Field({ nullable: true })
  name?: string;
}

@InputType()
export class DequeueMatchmakingInput {
  @Field(() => ID)
  clientId!: string;
}

@InputType()
export class MakeMoveOnlineInput {
  @Field(() => ID)
  clientId!: string;

  @Field(() => ID)
  gameId!: string;

  @Field(() => PositionInput)
  from!: PositionInput;

  @Field(() => PositionInput)
  to!: PositionInput;

  @Field({ nullable: true })
  promotion?: string;
}

@InputType()
export class RequestRematchInput {
  @Field(() => ID)
  clientId!: string;

  @Field(() => ID)
  gameId!: string;
}

@InputType()
export class RespondRematchInput {
  @Field(() => ID)
  clientId!: string;

  @Field(() => ID)
  gameId!: string;

  @Field()
  accept!: boolean;
}

@InputType()
export class QuitGameInput {
  @Field(() => ID)
  clientId!: string;

  @Field(() => ID)
  gameId!: string;
}
