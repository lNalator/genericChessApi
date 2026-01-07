import { Field, InputType, Int, ObjectType } from '@nestjs/graphql';

@InputType()
export class TimeControlInputDTO {
  @Field(() => Int)
  initialSeconds!: number;

  @Field(() => Int)
  incrementSeconds!: number;
}

@ObjectType()
export class TimeControlDTO {
  @Field(() => Int)
  initialSeconds!: number;

  @Field(() => Int)
  incrementSeconds!: number;
}
