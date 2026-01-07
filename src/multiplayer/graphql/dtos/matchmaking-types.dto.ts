import { Field, ID, ObjectType, registerEnumType } from '@nestjs/graphql';
import { ColorEnum } from '../../domain/engine/enums/color.enum';
import { MatchmakingDomainEventType } from '../../domain/events/matchmaking-domain-event';
import { TimeControlDTO } from './time-control.dto';

registerEnumType(MatchmakingDomainEventType, { name: 'MatchmakingEventType' });

@ObjectType()
export class EnqueueMatchmakingResponseDTO {
  @Field()
  queued!: boolean;
}

@ObjectType()
export class DequeueMatchmakingResponseDTO {
  @Field()
  dequeued!: boolean;
}

@ObjectType()
export class MatchmakingEventDTO {
  @Field(() => MatchmakingDomainEventType)
  type!: MatchmakingDomainEventType;

  @Field()
  at!: Date;

  @Field(() => ID)
  clientId!: string;

  @Field(() => ID, { nullable: true })
  matchId?: string | null;

  @Field(() => ID, { nullable: true })
  gameId?: string | null;

  @Field(() => ColorEnum, { nullable: true })
  playerColor?: ColorEnum | null;

  @Field(() => TimeControlDTO, { nullable: true })
  timeControl?: TimeControlDTO | null;

  @Field(() => Date, { nullable: true })
  deadlineAt?: Date | null;

  @Field(() => String, { nullable: true })
  message?: string | null;

  @Field(() => String, { nullable: true })
  errorCode?: string | null;
}
