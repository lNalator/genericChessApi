import { Injectable } from '@nestjs/common';
import { GameSession } from '../../domain/entities/game-session';
import { ColorEnum } from '../../domain/engine/enums/color.enum';
import { GameSessionState } from '../../domain/types/game-session-state.enum';
import { GameSessionViewDTO, GameViewDTO, PlayerDTO, ClockDTO } from '../dtos/game-types.dto';
import { TimeControlDTO } from '../dtos/time-control.dto';

@Injectable()
export class SessionMapper {
  toSessionView(session: GameSession, clientId: string): GameSessionViewDTO {
    const player = session.players.find((p) => p.id === clientId);
    const playerColor = (player?.color as ColorEnum) ?? ColorEnum.WHITE;
    return {
      gameId: session.id,
      code: session.code,
      playerColor,
      game: this.toGameView(session),
    };
  }

  toGameView(session: GameSession): GameViewDTO {
    const players: PlayerDTO[] = session.players.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color as ColorEnum,
      isPlaying: p.isPlaying,
    }));

    const clock: ClockDTO = {
      whiteSeconds: session.clock.remainingSeconds[ColorEnum.WHITE],
      blackSeconds: session.clock.remainingSeconds[ColorEnum.BLACK],
    };

    const timeControl: TimeControlDTO = {
      initialSeconds: session.timeControl.initialSeconds,
      incrementSeconds: session.timeControl.incrementSeconds,
    };

    return {
      id: session.id,
      status: session.state as GameSessionState,
      players,
      timeControl,
      clock,
      moves: session.moves.map((m) => ({
        from: { vertical: m.from.vertical, horizontal: m.from.horizontal },
        to: { vertical: m.to.vertical, horizontal: m.to.horizontal },
        promotion: m.promotion ?? null,
        by: m.by,
        playedAt: m.playedAt,
      })),
      winnerClientId: session.winnerClientId,
      endReason: session.endReason,
    };
  }
}
