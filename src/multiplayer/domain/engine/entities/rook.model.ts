import { ColorEnum } from '../enums/color.enum';
import PiecesHelper from '../helpers/pieces.helper';
import { AfterMovement } from '../interfaces/afterMovement';
import Position from '../interfaces/position';
import Piece from './piece.model';

export default class Rook extends Piece {
  value: number;
  isFirstMove: boolean;

  constructor(position: Position, color: ColorEnum, id: string) {
    super(position, color, 'Rook', id);
    this.value = 5;
    this.isFirstMove = true;
  }

  public move(position: Position, piece?: Piece): AfterMovement {
    let hasEaten = false;
    let ate: Piece | null = null;
    this.isFirstMove = false;
    if (piece) {
      this.eat(piece);
      hasEaten = true;
      ate = piece;
    }
    this.position = position;
    return { hasEaten, ate };
  }

  getAttacks(
    currentPlayerPieces: Array<Piece>,
    opponentPieces: Array<Piece>,
  ): Array<Position> {
    return this.getMovements(currentPlayerPieces, opponentPieces, true);
  }

  getMovements(
    currentPlayerPieces: Array<Piece>,
    opponentPieces: Array<Piece>,
    attacks?: boolean,
  ): Array<Position> {
    const movements: Array<Position> = [];

    const directions = [
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 },
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
    ];

    for (const direction of directions) {
      let currentPosition = { ...this.position };

      while (true) {
        currentPosition = {
          horizontal: currentPosition.horizontal + direction.dx,
          vertical: currentPosition.vertical + direction.dy,
        };

        if (
          currentPosition.horizontal < 0 ||
          currentPosition.horizontal >= 8 ||
          currentPosition.vertical < 0 ||
          currentPosition.vertical >= 8
        ) {
          break;
        }

        if (PiecesHelper.getEnemyPiecesByPosition(currentPosition, opponentPieces)) {
          movements.push({ ...currentPosition });
          break;
        } else if (
          PiecesHelper.getFriendlyPiecesByPosition(currentPosition, currentPlayerPieces)
        ) {
          if (attacks) {
            movements.push({ ...currentPosition });
          }
          break;
        } else {
          movements.push({ ...currentPosition });
        }
      }
    }

    return movements;
  }
}

