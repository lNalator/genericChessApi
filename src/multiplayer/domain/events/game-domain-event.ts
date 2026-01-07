import { ColorEnum } from '../engine/enums/color.enum';
import { GameMove } from '../types/move';
import { TimeControlConfig } from '../types/time-control';

export enum GameDomainEventType {
  SESSION_CREATED = 'SESSION_CREATED',
  PLAYER_JOINED = 'PLAYER_JOINED',
  READY_CHECK_STARTED = 'READY_CHECK_STARTED',
  PLAYER_READY = 'PLAYER_READY',
  GAME_STARTED = 'GAME_STARTED',
  MOVE_APPLIED = 'MOVE_APPLIED',
  CLOCK_UPDATED = 'CLOCK_UPDATED',
  GAME_ENDED = 'GAME_ENDED',
  ERROR_OCCURRED = 'ERROR_OCCURRED',
  PLAYER_DISCONNECTED = 'PLAYER_DISCONNECTED',
  PLAYER_RECONNECTED = 'PLAYER_RECONNECTED',
  DRAW_OFFERED = 'DRAW_OFFERED',
}

export type GameDomainEvent = {
  type: GameDomainEventType;
  at: Date;
  gameId: string;
  message?: string;
  targetClientId?: string | null;
  playerId?: string;
  playerColor?: ColorEnum;
  move?: GameMove;
  deadlineAt?: Date | null;
  errorCode?: string | null;
  remainingSeconds?: Record<ColorEnum, number>;
  timeControl?: TimeControlConfig;
};
