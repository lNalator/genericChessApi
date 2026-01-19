import { BoardPosition } from '../../../domain/types/move';

export type BotMoveCommand = {
  clientId: string;
  gameId: string;
  from: BoardPosition;
  to: BoardPosition;
  promotion?: string | null;
  movetimeMs: number;
};
