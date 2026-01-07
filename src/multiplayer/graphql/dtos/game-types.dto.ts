import { Field, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { ColorEnum } from '../../domain/engine/enums/color.enum';
import { GameSessionState } from '../../domain/types/game-session-state.enum';
import { GameDomainEventType } from '../../domain/events/game-domain-event';
import { BoardPositionDTO } from './position.dto';
import { TimeControlDTO } from './time-control.dto';

registerEnumType(GameDomainEventType, { name: 'GameEventType' });
registerEnumType(ColorEnum, { name: 'PlayerColor' });
registerEnumType(GameSessionState, { name: 'GameStatus' });

@ObjectType()
export class OkResponseDTO {
  @Field()
  ok!: boolean;
}

@ObjectType()
export class MakeMoveResponseDTO {
  @Field()
  ok!: boolean;

  @Field(() => GameViewDTO, { nullable: true })
  game?: GameViewDTO | null;
}

@ObjectType()
export class OfferDrawResponseDTO {
  @Field()
  ok!: boolean;

  @Field()
  accepted!: boolean;
}

@ObjectType()
export class PlayerDTO {
  @Field(() => ID)
  id!: string;

  @Field()
  name!: string;

  @Field(() => ColorEnum)
  color!: ColorEnum;

  @Field()
  isPlaying!: boolean;
}

@ObjectType()
export class ClockDTO {
  @Field(() => Int)
  whiteSeconds!: number;

  @Field(() => Int)
  blackSeconds!: number;
}

@ObjectType()
export class MoveDTO {
  @Field(() => BoardPositionDTO)
  from!: BoardPositionDTO;

  @Field(() => BoardPositionDTO)
  to!: BoardPositionDTO;

  @Field(() => String, { nullable: true })
  promotion?: string | null;

  @Field(() => ID)
  by!: string;

  @Field()
  playedAt!: Date;
}

@ObjectType()
export class GameViewDTO {
  @Field(() => ID)
  id!: string;

  @Field(() => GameSessionState)
  status!: GameSessionState;

  @Field(() => [PlayerDTO])
  players!: PlayerDTO[];

  @Field(() => TimeControlDTO)
  timeControl!: TimeControlDTO;

  @Field(() => ClockDTO)
  clock!: ClockDTO;

  @Field(() => [MoveDTO])
  moves!: MoveDTO[];

  @Field(() => String, { nullable: true })
  winnerClientId?: string | null;

  @Field(() => String, { nullable: true })
  endReason?: string | null;
}

@ObjectType()
export class GameSessionViewDTO {
  @Field(() => ID)
  gameId!: string;

  @Field(() => String, { nullable: true })
  code?: string | null;

  @Field(() => ColorEnum)
  playerColor!: ColorEnum;

  @Field(() => GameViewDTO)
  game!: GameViewDTO;
}

@ObjectType()
export class GameEventDTO {
  @Field(() => GameDomainEventType)
  type!: GameDomainEventType;

  @Field(() => ID)
  gameId!: string;

  @Field()
  at!: Date;

  @Field(() => String, { nullable: true })
  message?: string | null;

  @Field(() => String, { nullable: true })
  errorCode?: string | null;

  @Field(() => String, { nullable: true })
  targetClientId?: string | null;

  @Field(() => String, { nullable: true })
  playerId?: string | null;

  @Field(() => ColorEnum, { nullable: true })
  playerColor?: ColorEnum | null;

  @Field(() => MoveDTO, { nullable: true })
  move?: MoveDTO | null;

  @Field(() => ClockDTO, { nullable: true })
  clock?: ClockDTO | null;

  @Field(() => Date, { nullable: true })
  deadlineAt?: Date | null;
}
