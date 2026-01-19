import King from '../entities/king.model';
import Piece from '../entities/piece.model';
import Player from '../entities/player.model';
import PiecesHelper from './pieces.helper';

export default class PlayerHelper {
  static getOpponentColor(color: string): string {
    return color === 'white' ? 'black' : 'white';
  }

  static getAllPieces(players: Array<Player>): Array<Piece> {
    return players.reduce((acc: Array<Piece>, player: Player) => [...acc, ...player.pieces], []);
  }

  static getPlayingPlayer(players: Array<Player>): Player {
    return players.find((player) => player.isPlaying) as Player;
  }

  static getNotPlayingPlayer(players: Array<Player>): Player {
    return players.find((player) => !player.isPlaying) as Player;
  }

  static getOpponentPlayer(playingPlayer: Player, players: Array<Player>): Player {
    return players.find((player) => player.color !== playingPlayer.color) as Player;
  }

  static getPlayerByColor(players: Array<Player>, color: string): Player {
    return players.find((player) => player.color === color) as Player;
  }

  static getOpponentPieces(players: Array<Player>, color: string): Array<Piece> {
    return this.getPlayerByColor(players, this.getOpponentColor(color)).pieces;
  }

  static switchPlayerTurn(players: Array<Player>): void {
    players.forEach((player) => {
      player.isPlaying = !player.isPlaying;
      if (player.isPlaying) {
        PiecesHelper.resetDoubleJump(player.pieces);
      }
    });
  }

  static setPlayerTime(players: Array<Player>, time: number): void {
    players.forEach((player) => {
      player.time = time;
    });
  }

  static eatPiece(playingPlayer: Player, opponentPlayer: Player, piece: Piece): void {
    playingPlayer.eatenPieces.push(piece);
    opponentPlayer.pieces = opponentPlayer.pieces.filter((p) => p.id !== piece.id);
  }

  static getPlayersScoreDiff(playingPlayer: Player, opponentPlayer: Player): number {
    return playingPlayer.getPoints() - opponentPlayer.getPoints();
  }

  static cantPlay(opponentPlayer: Player, friendlyPieces: Piece[]): boolean {
    const opponentPieces: Piece[] = opponentPlayer.pieces.filter((piece) => piece.name !== 'King');
    const opponentKing: Piece = opponentPlayer.pieces.find((piece) => piece.name === 'King') as King;
    const enemyMovements = opponentPieces.flatMap((piece) =>
      piece.getFilteredMovements(opponentPlayer.pieces, friendlyPieces),
    );
    enemyMovements.push(...opponentKing.getMovements(opponentPieces, friendlyPieces));
    return enemyMovements[0] === null || enemyMovements[0] === undefined;
  }
}

