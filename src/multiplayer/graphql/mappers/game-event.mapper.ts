import { Injectable } from '@nestjs/common';
import { GameDomainEvent } from '../../domain/events/game-domain-event';
import { GameSession } from '../../domain/entities/game-session';
import { ColorEnum } from '../../domain/engine/enums/color.enum';
import { GameEventDTO, ClockDTO, MoveDTO } from '../dtos/game-types.dto';

@Injectable()
export class GameEventMapper {
  toDTO(event: GameDomainEvent, session?: GameSession | null): GameEventDTO {
    return {
      type: event.type,
      at: event.at,
      gameId: event.gameId,
      message: event.message ?? null,
      errorCode: event.errorCode ?? null,
      targetClientId: event.targetClientId ?? null,
      playerId: event.playerId ?? null,
      playerColor: (event.playerColor as ColorEnum) ?? null,
      move: event.move ? this.toMoveDTO(event.move) : null,
      clock: this.toClockDTO(event, session),
      deadlineAt: event.deadlineAt ?? null,
    };
  }

  private toMoveDTO(move: any): MoveDTO {
    return {
      from: { vertical: move.from.vertical, horizontal: move.from.horizontal },
      to: { vertical: move.to.vertical, horizontal: move.to.horizontal },
      promotion: move.promotion ?? null,
      by: move.by,
      playedAt: move.playedAt,
    };
  }

  private toClockDTO(event: GameDomainEvent, session?: GameSession | null): ClockDTO | null {
    if (event.remainingSeconds) {
      return {
        whiteSeconds: event.remainingSeconds[ColorEnum.WHITE],
        blackSeconds: event.remainingSeconds[ColorEnum.BLACK],
      };
    }
    if (session) {
      return {
        whiteSeconds: session.clock.remainingSeconds[ColorEnum.WHITE],
        blackSeconds: session.clock.remainingSeconds[ColorEnum.BLACK],
      };
    }
    return null;
  }
}
