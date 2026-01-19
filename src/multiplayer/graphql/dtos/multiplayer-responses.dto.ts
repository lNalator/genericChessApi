import { Field, ID, ObjectType } from '@nestjs/graphql';
import { ColorEnum } from '../../../domain/engine/enums/color.enum';

@ObjectType()
export class InviteGamePayloadDTO {
  @Field(() => ID)
  gameId!: string;

  @Field(() => ID)
  code!: string;

  @Field(() => ColorEnum)
  playerColor!: ColorEnum;
}

@ObjectType()
export class JoinInviteGamePayloadDTO {
  @Field(() => ID)
  gameId!: string;

  @Field(() => ColorEnum)
  playerColor!: ColorEnum;
}
