import { ColorEnum } from '../enums/color.enum';
import PiecesHelper from '../helpers/pieces.helper';
import Piece from './piece.model';

export default class Player {
  id: string;
  name: string;
  color: string;
  score: number;
  isPlaying: boolean;
  time: number;
  pieces: Array<Piece>;
  eatenPieces: Array<Piece>;
  askedDraw: boolean;

  constructor(
    id: string,
    name: string,
    color: string,
    isPlaying: boolean,
    time: number,
    pieces = PiecesHelper.createTeam(color as ColorEnum),
    eatenPieces = [],
    score = 0,
    askedDraw = false,
  ) {
    this.id = id;
    this.name = name;
    this.color = color;
    this.isPlaying = isPlaying;
    this.time = time;
    this.pieces = pieces;
    this.eatenPieces = eatenPieces;
    this.score = score;
    this.askedDraw = askedDraw;
  }

  getPoints() {
    return this.eatenPieces.reduce((acc, piece) => acc + piece.value, 0);
  }
}

