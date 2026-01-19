export type StockfishBestMove = {
  bestMove: string;
  ponder?: string | null;
};

export interface StockfishPort {
  bestMove(fen: string, movetimeMs: number): Promise<StockfishBestMove>;
}

export const STOCKFISH_PORT = 'STOCKFISH_PORT';
