import { Field, ID, InputType } from '@nestjs/graphql';
import { BoardPositionInputDTO } from './position.dto';
import { TimeControlInputDTO } from './time-control.dto';

@InputType()
export class CreateInviteGameInputDTO {
  @Field(() => ID)
  clientId!: string;

  @Field(() => String, { nullable: true })
  name?: string | null;

  @Field(() => TimeControlInputDTO)
  timeControl!: TimeControlInputDTO;
}

@InputType()
export class JoinInviteGameInputDTO {
  @Field(() => ID)
  clientId!: string;

  @Field()
  code!: string;

  @Field(() => String, { nullable: true })
  name?: string | null;
}

@InputType()
export class EnqueueMatchmakingInputDTO {
  @Field(() => ID)
  clientId!: string;

  @Field(() => String, { nullable: true })
  name?: string | null;

  @Field(() => TimeControlInputDTO)
  timeControl!: TimeControlInputDTO;
}

@InputType()
export class DequeueMatchmakingInputDTO {
  @Field(() => ID)
  clientId!: string;
}

@InputType()
export class ClientReadyInputDTO {
  @Field(() => ID)
  clientId!: string;

  @Field(() => ID)
  gameId!: string;
}

@InputType()
export class MakeMoveInputDTO {
  @Field(() => ID)
  clientId!: string;

  @Field(() => ID)
  gameId!: string;

  @Field(() => BoardPositionInputDTO)
  from!: BoardPositionInputDTO;

  @Field(() => BoardPositionInputDTO)
  to!: BoardPositionInputDTO;

  @Field(() => String,{ nullable: true })
  promotion?: string | null;
}

@InputType()
export class ResignInputDTO {
  @Field(() => ID)
  clientId!: string;

  @Field(() => ID)
  gameId!: string;
}

@InputType()
export class NotifyDisconnectInputDTO {
  @Field(() => ID)
  clientId!: string;

  @Field(() => ID)
  gameId!: string;
}

@InputType()
export class NotifyReconnectInputDTO {
  @Field(() => ID)
  clientId!: string;

  @Field(() => ID)
  gameId!: string;
}

@InputType()
export class OfferDrawInputDTO {
  @Field(() => ID)
  clientId!: string;

  @Field(() => ID)
  gameId!: string;
}
