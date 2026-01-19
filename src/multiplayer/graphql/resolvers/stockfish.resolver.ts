import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { StockfishService } from '../../application/services/stockfish.service';
import { BestMoveDTO } from '../dtos/stockfish.dto';

@Resolver()
export class StockfishResolver {
  constructor(private readonly stockfish: StockfishService) {}

  @Query(() => BestMoveDTO)
  bestMove(
    @Args('fen', { type: () => String }) fen: string,
    @Args('movetimeMs', { type: () => Int }) movetimeMs: number,
  ): Promise<BestMoveDTO> {
    return this.stockfish.bestMove(fen, movetimeMs);
  }
}
