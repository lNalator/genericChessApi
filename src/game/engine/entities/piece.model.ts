import { ColorEnum } from '../enums/color.enum';
import { AfterMovement } from '../interfaces/afterMovement';
import PiecesHelper from '../helpers/pieces.helper';
import Position from '../interfaces/position';

export default abstract class Piece {
  public id: string;
  public position: Position;
  public isAlive: boolean;
  public color: ColorEnum;
  abstract value: number;
  public name: string;

  constructor(position: Position, color: ColorEnum, name: string, id: string) {
    this.name = name;
    this.position = position;
    this.isAlive = true;
    this.color = color;
    this.id = id;
  }

  public move(position: Position, piece?: Piece): AfterMovement {
    let hasEaten = false;
    let ate: Piece | null = null;
    if (piece) {
      this.eat(piece);
      hasEaten = true;
      ate = piece;
    }
    this.position = position;
    return { hasEaten, ate };
  }

  public eat(piece: Piece): void {
    piece.isAlive = false;
    piece.position = { horizontal: -1, vertical: -1 };
  }

  public getFilteredMovements(
    friendlyPieces: Array<Piece>,
    enemyPieces: Array<Piece>,
  ): Position[] {
    const possibleMovements = this.getMovements(friendlyPieces, enemyPieces);

    return possibleMovements.filter((move) => {
      const simulatedFriendlyPieces: Piece[] = PiecesHelper.simulateMove(
        friendlyPieces,
        this,
        move,
      );

      return !PiecesHelper.isKingInCheck(simulatedFriendlyPieces, enemyPieces, move);
    });
  }

  public getAttacks(
    currentPlayerPieces: Array<Piece>,
    opponentPieces: Array<Piece>,
  ): Array<Position> {
    return this.getMovements(currentPlayerPieces, opponentPieces);
  }

  abstract getMovements(
    currentPlayerPieces: Array<Piece>,
    opponentPieces: Array<Piece>,
  ): Array<Position>;
}

