import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class BestMoveDTO {
  @Field()
  bestMove!: string;

  @Field(() => String, { nullable: true })
  ponder?: string | null;
}
