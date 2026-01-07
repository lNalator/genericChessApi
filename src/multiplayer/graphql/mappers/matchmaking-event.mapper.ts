import { Injectable } from '@nestjs/common';
import { MatchmakingDomainEvent } from '../../domain/events/matchmaking-domain-event';
import { MatchmakingEventDTO } from '../dtos/matchmaking-types.dto';

@Injectable()
export class MatchmakingEventMapper {
  toDTO(event: MatchmakingDomainEvent): MatchmakingEventDTO {
    return {
      type: event.type,
      at: event.at,
      clientId: event.clientId,
      matchId: event.matchId ?? null,
      gameId: event.gameId ?? null,
      playerColor: event.playerColor ?? null,
      timeControl: event.timeControl
        ? {
            initialSeconds: event.timeControl.initialSeconds,
            incrementSeconds: event.timeControl.incrementSeconds,
          }
        : null,
      deadlineAt: event.deadlineAt ?? null,
      message: event.message ?? null,
      errorCode: event.errorCode ?? null,
    };
  }
}
