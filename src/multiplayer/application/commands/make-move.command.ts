import { BoardPosition } from '../../domain/types/move';

export type MakeMoveCommand = {
  clientId: string;
  gameId: string;
  from: BoardPosition;
  to: BoardPosition;
  promotion?: string | null;
};
