import { Field, InputType, Int, ObjectType } from '@nestjs/graphql';

@InputType()
export class BoardPositionInputDTO {
  @Field(() => Int)
  vertical!: number;

  @Field(() => Int)
  horizontal!: number;
}

@ObjectType()
export class BoardPositionDTO {
  @Field(() => Int)
  vertical!: number;

  @Field(() => Int)
  horizontal!: number;
}
