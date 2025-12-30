import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PubSub } from 'graphql-subscriptions';
import { CreateGameInput, JoinGameInput, LeaveGameInput, MoveInput } from './dto/game.inputs';
import { Game, GameEvent, GameEventType, GameStatus, Move } from './dto/game.types';
import { ColorEnum } from './engine/enums/color.enum';
import Player from './engine/entities/player.model';
import PlayerHelper from './engine/helpers/player.helper';
import PiecesHelper from './engine/helpers/pieces.helper';

type GameDomain = {
  id: string;
  status: GameStatus;
  players: [Player, Player];
  hasGameEnded: boolean;
  winner: Player | null;
  reason: Record<string, boolean>;
  createdAt: Date;
  updatedAt: Date;
};

export const GAME_EVENTS_TOPIC = 'GAME_EVENTS_TOPIC';

@Injectable()
export class GameService {
  private readonly logger = new Logger(GameService.name);
  private readonly games = new Map<string, GameDomain>();

  constructor(private readonly pubSub: PubSub) {}

  getGame(gameId: string): Game {
    const game = this.games.get(gameId);
    if (!game) throw new NotFoundException('Game not found');
    return this.toGraphQL(game);
  }

  createGame(input: CreateGameInput): Game {
    const id = randomUUID();
    const now = new Date();

    const white = new Player(
      input.playerId,
      input.name ?? 'Player 1',
      ColorEnum.WHITE,
      true,
      input.timeLimitSeconds ?? 60,
    );

    const black = new Player(
      'OPEN',
      'Waiting for player',
      ColorEnum.BLACK,
      false,
      input.timeLimitSeconds ?? 60,
    );

    const game: GameDomain = {
      id,
      status: GameStatus.WAITING_FOR_PLAYERS,
      players: [white, black],
      hasGameEnded: false,
      winner: null,
      reason: {},
      createdAt: now,
      updatedAt: now,
    };

    this.games.set(id, game);
    this.logger.log(`createGame gameId=${id} whitePlayerId=${input.playerId}`);

    const gql = this.toGraphQL(game);
    this.publishEvent({
      type: GameEventType.PLAYER_JOINED,
      gameId: id,
      at: now,
      game: gql,
      player: gql.players[0],
    });

    return gql;
  }

  joinGame(gameId: string, input: JoinGameInput): Game {
    const game = this.games.get(gameId);
    if (!game) throw new NotFoundException('Game not found');
    if (game.status === GameStatus.ENDED) throw new BadRequestException('Game already ended');

    const existing = game.players.find((p) => p.id === input.playerId);
    if (existing) {
      this.logger.log(`joinGame rejoin gameId=${gameId} playerId=${input.playerId}`);
      return this.toGraphQL(game);
    }

    const black = game.players.find((p) => p.color === ColorEnum.BLACK) as Player;
    if (black.id !== 'OPEN') throw new BadRequestException('Game is full');

    black.id = input.playerId;
    black.name = input.name ?? 'Player 2';

    game.status = GameStatus.IN_PROGRESS;
    game.updatedAt = new Date();

    this.logger.log(`joinGame gameId=${gameId} blackPlayerId=${input.playerId}`);

    const gql = this.toGraphQL(game);
    this.publishEvent({
      type: GameEventType.PLAYER_JOINED,
      gameId,
      at: game.updatedAt,
      game: gql,
      player: gql.players.find((p) => p.id === input.playerId),
    });
    this.publishEvent({
      type: GameEventType.GAME_STARTED,
      gameId,
      at: game.updatedAt,
      game: gql,
    });

    return gql;
  }

  leaveGame(gameId: string, input: LeaveGameInput): Game {
    const game = this.games.get(gameId);
    if (!game) throw new NotFoundException('Game not found');

    const leaving = game.players.find((p) => p.id === input.playerId);
    if (!leaving) throw new BadRequestException('Player not in game');

    const now = new Date();

    if (leaving.color === ColorEnum.WHITE) {
      this.games.delete(gameId);
      const dummy = this.toGraphQL(game);
      this.publishEvent({
        type: GameEventType.PLAYER_LEFT,
        gameId,
        at: now,
        game: dummy,
        player: dummy.players.find((p) => p.id === input.playerId),
      });
      this.logger.log(`leaveGame deleted gameId=${gameId} playerId=${input.playerId}`);
      return dummy;
    }

    leaving.id = 'OPEN';
    leaving.name = 'Waiting for player';
    leaving.isPlaying = false;

    game.status = GameStatus.WAITING_FOR_PLAYERS;
    game.updatedAt = now;

    const gql = this.toGraphQL(game);
    this.publishEvent({
      type: GameEventType.PLAYER_LEFT,
      gameId,
      at: now,
      game: gql,
      player: gql.players.find((p) => p.color === ColorEnum.BLACK),
    });

    return gql;
  }

  makeMove(gameId: string, input: MoveInput): Game {
    const game = this.games.get(gameId);
    if (!game) throw new NotFoundException('Game not found');
    if (game.status !== GameStatus.IN_PROGRESS) throw new BadRequestException('Game not started');
    if (game.hasGameEnded) throw new BadRequestException('Game ended');

    const player = game.players.find((p) => p.id === input.playerId);
    if (!player) throw new BadRequestException('Player not in game');
    if (player.id === 'OPEN') throw new BadRequestException('Player slot not taken');

    const playingPlayer = PlayerHelper.getPlayingPlayer(game.players);
    const notPlayingPlayer = PlayerHelper.getNotPlayingPlayer(game.players);

    if (player.color !== playingPlayer.color) {
      throw new BadRequestException('Not your turn');
    }

    const allPieces = PlayerHelper.getAllPieces(game.players);
    const selectedPiece = allPieces.find(
      (p) => p.position.vertical === input.from.vertical && p.position.horizontal === input.from.horizontal,
    );
    if (!selectedPiece) throw new BadRequestException('No piece at from');
    if (selectedPiece.color !== playingPlayer.color) {
      throw new BadRequestException('Cannot move opponent piece');
    }

    const to = { vertical: input.to.vertical, horizontal: input.to.horizontal };
    const isPossibleMove = selectedPiece
      .getFilteredMovements(playingPlayer.pieces, notPlayingPlayer.pieces)
      .some((m) => m.vertical === to.vertical && m.horizontal === to.horizontal);
    if (!isPossibleMove) throw new BadRequestException('Illegal move');

    const pieceAtDestination = allPieces.find(
      (p) => p.position.vertical === to.vertical && p.position.horizontal === to.horizontal,
    );

    const afterMovement = selectedPiece.move(to, pieceAtDestination ?? undefined);
    if (afterMovement.hasEaten && afterMovement.ate) {
      PlayerHelper.eatPiece(playingPlayer, notPlayingPlayer, afterMovement.ate);
    }

    if (afterMovement?.castle) {
      PiecesHelper.moveRookForCastle(playingPlayer, selectedPiece, afterMovement.castle);
    }

    if (afterMovement?.enPassant) {
      PiecesHelper.eatEnPassant(selectedPiece, playingPlayer, notPlayingPlayer);
    }

    if (selectedPiece.name === 'Pawn') {
      if (selectedPiece.color === ColorEnum.WHITE && to.vertical === 7) {
        PiecesHelper.pawnPromotion(selectedPiece, to, playingPlayer);
      }
      if (selectedPiece.color === ColorEnum.BLACK && to.vertical === 0) {
        PiecesHelper.pawnPromotion(selectedPiece, to, playingPlayer);
      }
    }

    if (PlayerHelper.cantPlay(notPlayingPlayer, playingPlayer.pieces)) {
      if (PiecesHelper.isKingInCheck(notPlayingPlayer.pieces, playingPlayer.pieces)) {
        playingPlayer.score++;
        game.hasGameEnded = true;
        game.winner = playingPlayer;
        game.reason = { checkmate: true };
        game.status = GameStatus.ENDED;
      } else {
        game.players.forEach((p) => {
          p.score += 0.5;
        });
        game.hasGameEnded = true;
        game.winner = null;
        game.reason = { stalemate: true };
        game.status = GameStatus.ENDED;
      }
    }

    PlayerHelper.switchPlayerTurn(game.players);

    const now = new Date();
    game.updatedAt = now;

    const gql = this.toGraphQL(game);
    const move: Move = {
      from: { vertical: input.from.vertical, horizontal: input.from.horizontal },
      to: { vertical: input.to.vertical, horizontal: input.to.horizontal },
      promotion: input.promotion,
      byPlayerId: input.playerId,
      playedAt: now,
    };

    this.publishEvent({
      type: GameEventType.MOVE_PLAYED,
      gameId,
      at: now,
      game: gql,
      move,
    });
    if (game.status === GameStatus.ENDED) {
      this.publishEvent({
        type: GameEventType.GAME_ENDED,
        gameId,
        at: now,
        game: gql,
      });
    }

    return gql;
  }

  asyncIterator() {
    return (this.pubSub as any).asyncIterator(GAME_EVENTS_TOPIC);
  }

  private publishEvent(event: GameEvent) {
    void this.pubSub.publish(GAME_EVENTS_TOPIC, { gameEvents: event });
    this.logger.debug(`event ${event.type} gameId=${event.gameId}`);
  }

  private toGraphQL(game: GameDomain): Game {
    const playingPlayer = PlayerHelper.getPlayingPlayer(game.players);
    return {
      id: game.id,
      status: game.status,
      players: game.players as any,
      boardFen: null,
      turnColor: playingPlayer.color as ColorEnum,
      createdAt: game.createdAt,
      updatedAt: game.updatedAt,
      state: {
        players: game.players as any,
        hasGameEnded: game.hasGameEnded,
        winner: game.winner as any,
        reason: game.reason as any,
      },
    };
  }
}
