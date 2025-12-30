import Piece from '../entities/piece.model';
import { CastleEnum } from '../enums/castle.enum';

export interface AfterMovement {
  hasEaten: boolean;
  ate: Piece | null;
  castle?: CastleEnum | null;
  enPassant?: boolean;
}

