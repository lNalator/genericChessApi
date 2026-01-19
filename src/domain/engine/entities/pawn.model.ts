import { ColorEnum } from '../enums/color.enum';
import PiecesHelper from '../helpers/pieces.helper';
import { AfterMovement } from '../interfaces/afterMovement';
import Position from '../interfaces/position';
import Piece from './piece.model';

export default class Pawn extends Piece {
  value: number;
  isFirstMove: boolean;
  doubleJump: boolean;

  constructor(position: Position, color: ColorEnum, id: string) {
    super(position, color, 'Pawn', id);
    this.isFirstMove = true;
    this.doubleJump = false;
    this.value = 1;
  }

  public move(position: Position, piece?: Piece): AfterMovement {
    let hasEaten = false;
    let ate: Piece | null = null;
    let enPassant = false;
    this.isFirstMove = false;

    if (piece) {
      this.eat(piece);
      hasEaten = true;
      ate = piece;
    } else if (position.horizontal !== this.position.horizontal) {
      enPassant = true;
    }
    if (
      position.vertical === this.position.vertical + 2 ||
      position.vertical === this.position.vertical - 2
    ) {
      this.doubleJump = true;
    }
    this.position = position;
    return { hasEaten, ate, enPassant };
  }

  getAttacks(): Array<Position> {
    const firstPos: Position = { ...this.position };
    const secondPos: Position = { ...this.position };
    firstPos.vertical += this.color === ColorEnum.WHITE ? 1 : -1;
    secondPos.vertical += this.color === ColorEnum.WHITE ? 1 : -1;
    firstPos.horizontal += 1;
    secondPos.horizontal -= 1;
    return [firstPos, secondPos];
  }

  getMovements(
    currentPlayerPieces: Array<Piece>,
    opponentPieces: Array<Piece>,
  ): Array<Position> {
    const movements: Array<Position> = [];
    const horizontal: number = this.position.horizontal;
    const vertical: number = this.position.vertical;
    let colorValue: number;

    if (this.color === ColorEnum.WHITE) {
      colorValue = 1;
    } else {
      colorValue = -1;
    }

    const newPosition1: Position = {
      horizontal: horizontal,
      vertical: vertical + colorValue,
    };
    if (
      PiecesHelper.getPieceByPosition(newPosition1, [
        ...currentPlayerPieces,
        ...opponentPieces,
      ]) === null
    ) {
      movements.push(newPosition1);
      if (this.isFirstMove) {
        const newPosition2: Position = {
          horizontal: horizontal,
          vertical: vertical + colorValue * 2,
        };
        if (
          PiecesHelper.getPieceByPosition(newPosition2, [
            ...currentPlayerPieces,
            ...opponentPieces,
          ]) === null
        ) {
          movements.push(newPosition2);
        }
      }
    }

    const newPosition3: Position = {
      horizontal: horizontal + 1,
      vertical: vertical + colorValue,
    };
    if (
      PiecesHelper.getPieceByPosition(newPosition3, [
        ...currentPlayerPieces,
        ...opponentPieces,
      ])?.color !== this.color &&
      PiecesHelper.getPieceByPosition(newPosition3, [
        ...currentPlayerPieces,
        ...opponentPieces,
      ]) !== null
    ) {
      movements.push(newPosition3);
    }
    const newPosition4: Position = {
      horizontal: horizontal - 1,
      vertical: vertical + colorValue,
    };
    if (
      PiecesHelper.getPieceByPosition(newPosition4, [
        ...currentPlayerPieces,
        ...opponentPieces,
      ])?.color !== this.color &&
      PiecesHelper.getPieceByPosition(newPosition4, [
        ...currentPlayerPieces,
        ...opponentPieces,
      ]) !== null
    ) {
      movements.push(newPosition4);
    }

    const newPosition5: Position = {
      horizontal: horizontal + 1,
      vertical: vertical,
    };
    const rightSquarePiece = PiecesHelper.getEnemyPiecesByPosition(newPosition5, opponentPieces);
    if (rightSquarePiece !== null) {
      const enPassantPawn = rightSquarePiece as Pawn;
      if (enPassantPawn?.doubleJump) {
        newPosition5.vertical += this.color === ColorEnum.WHITE ? 1 : -1;
        movements.push(newPosition5);
      }
    }
    const newPosition6: Position = {
      horizontal: horizontal - 1,
      vertical: vertical,
    };
    const leftSquarePiece = PiecesHelper.getEnemyPiecesByPosition(newPosition6, opponentPieces);
    if (leftSquarePiece !== null) {
      const enPassantPawn = leftSquarePiece as Pawn;
      if (enPassantPawn?.doubleJump) {
        newPosition6.vertical += this.color === ColorEnum.WHITE ? 1 : -1;
        movements.push(newPosition6);
      }
    }

    return movements;
  }
}

