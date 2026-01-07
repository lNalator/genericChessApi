import { CastleEnum } from '../enums/castle.enum';
import { ColorEnum } from '../enums/color.enum';
import PiecesHelper from '../helpers/pieces.helper';
import { AfterMovement } from '../interfaces/afterMovement';
import Position from '../interfaces/position';
import Piece from './piece.model';

export default class King extends Piece {
  value: number;
  isChecked: boolean;
  isFirstMove: boolean;

  constructor(position: Position, color: ColorEnum, id: string) {
    super(position, color, 'King', id);
    this.value = 100;
    this.isChecked = false;
    this.isFirstMove = true;
  }

  public move(position: Position, piece?: Piece): AfterMovement {
    let hasEaten = false;
    let ate: Piece | null = null;
    let castle: CastleEnum | null = null;
    this.isFirstMove = false;
    if (position.horizontal === this.position.horizontal + 2) {
      castle = CastleEnum.SMALL;
    }
    if (position.horizontal === this.position.horizontal - 2) {
      castle = CastleEnum.LARGE;
    }
    if (piece) {
      this.eat(piece);
      hasEaten = true;
      ate = piece;
    }
    this.position = position;
    return { hasEaten, ate, castle };
  }

  getAttacks(): Array<Position> {
    const movements: Array<Position> = [];

    const directions = [
      { dx: -1, dy: -1 },
      { dx: -1, dy: 0 },
      { dx: -1, dy: 1 },
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 },
      { dx: 1, dy: -1 },
      { dx: 1, dy: 0 },
      { dx: 1, dy: 1 },
    ];

    for (const direction of directions) {
      const currentPosition = { ...this.position };

      currentPosition.horizontal += direction.dx;
      currentPosition.vertical += direction.dy;

      movements.push(currentPosition);
    }
    return movements;
  }

  getMovements(
    currentPlayerPieces: Array<Piece>,
    opponentPieces: Array<Piece>,
  ): Array<Position> {
    const movements: Array<Position> = [];

    const directions = [
      { dx: -1, dy: -1 },
      { dx: -1, dy: 0 },
      { dx: -1, dy: 1 },
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 },
      { dx: 1, dy: -1 },
      { dx: 1, dy: 0 },
      { dx: 1, dy: 1 },
    ];

    for (const direction of directions) {
      const currentPosition = { ...this.position };

      currentPosition.horizontal += direction.dx;
      currentPosition.vertical += direction.dy;

      if (
        currentPosition.vertical >= 0 &&
        currentPosition.vertical < 8 &&
        currentPosition.horizontal >= 0 &&
        currentPosition.horizontal < 8 &&
        PiecesHelper.getPieceByPosition(currentPosition, [
          ...currentPlayerPieces,
          ...opponentPieces,
        ])?.color !== this.color &&
        PiecesHelper.isSafePosition(currentPlayerPieces, opponentPieces, currentPosition)
      ) {
        movements.push(currentPosition);
      }
    }

    let castleSafe = true;
    let castlePosition: Position = { ...this.position };
    if (PiecesHelper.canSmallCastle(this, currentPlayerPieces)) {
      while (castlePosition.horizontal < 7) {
        castlePosition.horizontal += 1;
        if (!PiecesHelper.isSafePosition(currentPlayerPieces, opponentPieces, castlePosition)) {
          castleSafe = false;
        }
      }
      if (!this.isChecked && castleSafe) {
        const newPosition = { ...this.position };
        newPosition.horizontal += 2;
        movements.push(newPosition);
      }
    }

    castleSafe = true;
    castlePosition = { ...this.position };
    if (PiecesHelper.canLargeCastle(this, currentPlayerPieces)) {
      while (castlePosition.horizontal > 0) {
        castlePosition.horizontal -= 1;
        if (!PiecesHelper.isSafePosition(currentPlayerPieces, opponentPieces, castlePosition)) {
          castleSafe = false;
        }
      }
      if (!this.isChecked && castleSafe) {
        const newPosition = { ...this.position };
        newPosition.horizontal -= 2;
        movements.push(newPosition);
      }
    }

    return movements;
  }
}

