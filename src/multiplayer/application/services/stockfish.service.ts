import { Inject, Injectable } from '@nestjs/common';
import { STOCKFISH_PORT, StockfishPort, StockfishBestMove } from '../ports/stockfish.port';

@Injectable()
export class StockfishService {
  constructor(@Inject(STOCKFISH_PORT) private readonly engine: StockfishPort) {}

  bestMove(fen: string, movetimeMs: number): Promise<StockfishBestMove> {
    return this.engine.bestMove(fen, movetimeMs);
  }
}
