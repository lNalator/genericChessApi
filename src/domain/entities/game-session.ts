import Player from '../engine/entities/player.model';
import { GameSessionState } from '../types/game-session-state.enum';
import { ReadyCheckState } from '../types/ready-check';
import { TimeControlConfig } from '../types/time-control';
import { GameMove } from '../types/move';
import { ClockState } from '../strategies/time-control-strategy';

export type GameSession = {
  id: string;
  code: string | null;
  state: GameSessionState;
  origin: 'invite' | 'matchmaking' | 'bot';
  players: [Player, Player];
  timeControl: TimeControlConfig;
  clock: ClockState;
  moves: GameMove[];
  readyCheck: ReadyCheckState | null;
  disconnectDeadlines: Record<string, Date | null>;
  pendingDrawByClientId: string | null;
  winnerClientId: string | null;
  endReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};
