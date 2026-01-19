import { GameSession } from '../../../domain/entities/game-session';
import { ColorEnum } from '../../../domain/engine/enums/color.enum';
import PlayerHelper from '../../../domain/engine/helpers/player.helper';
import Player from '../../../domain/engine/entities/player.model';
import Piece from '../../../domain/engine/entities/piece.model';
import Pawn from '../../../domain/engine/entities/pawn.model';
import { BoardPosition } from '../../../domain/types/move';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
export type UciMove = {
  from: BoardPosition;
  to: BoardPosition;
  promotion?: string | null;
};
export function buildFen(session: GameSession): string {
  const pieces = PlayerHelper.getAllPieces(session.players);
  const pieceMap = new Map<string, Piece>();
  for (const piece of pieces) {
    if (piece.position.horizontal < 0 || piece.position.vertical < 0) continue;
    pieceMap.set(`${piece.position.vertical}-${piece.position.horizontal}`, piece);
  }

  const ranks: string[] = [];
  for (let rank = 7; rank >= 0; rank--) {
    let empty = 0;
    let row = '';
    for (let file = 0; file < 8; file++) {
      const piece = pieceMap.get(`${rank}-${file}`);
      if (!piece) {
        empty += 1;
        continue;
      }
      if (empty > 0) {
        row += String(empty);
        empty = 0;
      }
      row += pieceToFen(piece);
    }
    if (empty > 0) {
      row += String(empty);
    }
    ranks.push(row);
  }

  const active = PlayerHelper.getPlayingPlayer(session.players).color === ColorEnum.WHITE ? 'w' : 'b';
  const castling = buildCastlingRights(session.players);
  const enPassant = buildEnPassant(session.players);
  const fullmove = Math.floor(session.moves.length / 2) + 1;
  return `${ranks.join('/')} ${active} ${castling} ${enPassant} 0 ${fullmove}`;
}

export function parseUciMove(rawMove: string): UciMove | null {
  const move = rawMove.trim().toLowerCase();
  if (move === '(none)' || move === '0000') return null;
  if (move.length < 4) return null;

  const fromFile = fileIndex(move[0]);
  const fromRank = Number.parseInt(move[1], 10);
  const toFile = fileIndex(move[2]);
  const toRank = Number.parseInt(move[3], 10);
  if (fromFile < 0 || toFile < 0 || !isRank(fromRank) || !isRank(toRank)) return null;
  const promotion = move.length > 4 ? move[4] : null;
  return {
    from: { horizontal: fromFile, vertical: fromRank - 1 },
    to: { horizontal: toFile, vertical: toRank - 1 },
    promotion,
  };
}

function pieceToFen(piece: Piece): string {
  const map: Record<string, string> = {
    Pawn: 'p',
    Knight: 'n',
    Bishop: 'b',
    Rook: 'r',
    Queen: 'q',
    King: 'k',
  };
  const base = map[piece.name] ?? '';
  if (!base) return '';
  return piece.color === ColorEnum.WHITE ? base.toUpperCase() : base;
}

function buildCastlingRights(players: Player[]): string {
  const pieces = players.flatMap((p) => p.pieces);
  const rights: string[] = [];
  const whiteKing = findPiece(pieces, ColorEnum.WHITE, 'King', 0, 4);
  if (whiteKing && hasFirstMove(whiteKing)) {
    const rookH = findPiece(pieces, ColorEnum.WHITE, 'Rook', 0, 7);
    const rookA = findPiece(pieces, ColorEnum.WHITE, 'Rook', 0, 0);
    if (rookH && hasFirstMove(rookH)) rights.push('K');
    if (rookA && hasFirstMove(rookA)) rights.push('Q');
  }

  const blackKing = findPiece(pieces, ColorEnum.BLACK, 'King', 7, 4);
  if (blackKing && hasFirstMove(blackKing)) {
    const rookH = findPiece(pieces, ColorEnum.BLACK, 'Rook', 7, 7);
    const rookA = findPiece(pieces, ColorEnum.BLACK, 'Rook', 7, 0);
    if (rookH && hasFirstMove(rookH)) rights.push('k');
    if (rookA && hasFirstMove(rookA)) rights.push('q');
  }

  return rights.length > 0 ? rights.join('') : '-';
}

function buildEnPassant(players: Player[]): string {
  const playing = PlayerHelper.getPlayingPlayer(players);
  const lastMover = players.find((p) => p.color !== playing.color);
  if (!lastMover) return '-';
  const pawn = lastMover.pieces.find(
    (piece) => piece.name === 'Pawn' && (piece as Pawn).doubleJump,
  ) as Pawn | undefined;
  if (!pawn) return '-';
  const targetVertical =
    pawn.color === ColorEnum.WHITE ? pawn.position.vertical - 1 : pawn.position.vertical + 1;
  if (targetVertical < 0 || targetVertical > 7) return '-';
  const file = FILES[pawn.position.horizontal];
  return file ? `${file}${targetVertical + 1}` : '-';
}

function findPiece(
  pieces: Piece[],
  color: ColorEnum,
  name: string,
  vertical: number,
  horizontal: number,
): Piece | null {
  return (
    pieces.find(
      (piece) =>
        piece.color === color &&
        piece.name === name &&
        piece.position.vertical === vertical &&
        piece.position.horizontal === horizontal,
    ) ?? null
  );
}

function hasFirstMove(piece: Piece): boolean {
  return Boolean((piece as Piece & { isFirstMove?: boolean }).isFirstMove);
}

function fileIndex(file: string): number {
  return FILES.indexOf(file);
}

function isRank(rank: number): boolean {
  return Number.isFinite(rank) && rank >= 1 && rank <= 8;
}
