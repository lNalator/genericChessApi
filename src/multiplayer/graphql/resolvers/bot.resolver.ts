import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { BotGameService } from '../../application/services/bot-game.service';
import { SessionMapper } from '../mappers/session.mapper';
import { BotMoveInputDTO, BotMoveResponseDTO, StartBotGameInputDTO } from '../dtos/bot.dto';
import { GameSessionViewDTO } from '../dtos/game-types.dto';

@Resolver()
export class BotResolver {
  constructor(
    private readonly botGames: BotGameService,
    private readonly sessionMapper: SessionMapper,
  ) {}

  @Mutation(() => GameSessionViewDTO)
  startBotGame(@Args('input') input: StartBotGameInputDTO): GameSessionViewDTO {
    const { session } = this.botGames.createBotGame({
      clientId: input.clientId,
      name: input.name,
    });
    return this.sessionMapper.toSessionView(session, input.clientId);
  }

  @Mutation(() => BotMoveResponseDTO)
  async botMove(@Args('input') input: BotMoveInputDTO): Promise<BotMoveResponseDTO> {
    const result = await this.botGames.playBotMove({
      clientId: input.clientId,
      gameId: input.gameId,
      from: input.from,
      to: input.to,
      promotion: input.promotion,
      movetimeMs: input.movetimeMs,
    });
    return {
      bestMove: result.bestMove ?? null,
      ponder: result.ponder ?? null,
      game: this.sessionMapper.toGameView(result.session),
    };
  }
}
