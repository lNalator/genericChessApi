import { ColorEnum } from '../enums/color.enum';
import PiecesHelper from '../helpers/pieces.helper';
import Position from '../interfaces/position';
import Piece from './piece.model';

export default class Knight extends Piece {
  value: number;

  constructor(position: Position, color: ColorEnum, id: string) {
    super(position, color, 'Knight', id);
    this.value = 3;
  }

  getMovements(
    currentPlayerPieces: Array<Piece>,
    opponentPieces: Array<Piece>,
  ): Array<Position> {
    const movements: Array<Position> = [];

    const directions = [
      { dx: 2, dy: 1 },
      { dx: 2, dy: -1 },
      { dx: -2, dy: 1 },
      { dx: -2, dy: -1 },
      { dx: 1, dy: 2 },
      { dx: -1, dy: 2 },
      { dx: 1, dy: -2 },
      { dx: -1, dy: -2 },
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
        ])?.color !== this.color
      ) {
        movements.push(currentPosition);
      }
    }

    return movements;
  }
}

