import { Field, ID, InputType, Int, ObjectType } from '@nestjs/graphql';
import { BoardPositionInputDTO } from './position.dto';
import { GameViewDTO } from './game-types.dto';

@InputType()
export class StartBotGameInputDTO {
  @Field(() => ID)
  clientId!: string;

  @Field(() => String, { nullable: true })
  name?: string | null;
}

@InputType()
export class BotMoveInputDTO {
  @Field(() => ID)
  clientId!: string;

  @Field(() => ID)
  gameId!: string;

  @Field(() => BoardPositionInputDTO)
  from!: BoardPositionInputDTO;

  @Field(() => BoardPositionInputDTO)
  to!: BoardPositionInputDTO;

  @Field(() => String, { nullable: true })
  promotion?: string | null;

  @Field(() => Int)
  movetimeMs!: number;
}

@ObjectType()
export class BotMoveResponseDTO {
  @Field(() => String, { nullable: true })
  bestMove?: string | null;

  @Field(() => String, { nullable: true })
  ponder?: string | null;

  @Field(() => GameViewDTO)
  game!: GameViewDTO;
}
