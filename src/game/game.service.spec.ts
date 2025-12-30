import { Test } from '@nestjs/testing';
import { PubSub } from 'graphql-subscriptions';
import { GameService } from './game.service';

describe('GameService', () => {
  let gameService: GameService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        GameService,
        {
          provide: PubSub,
          useValue: new PubSub(),
        },
      ],
    }).compile();

    gameService = moduleRef.get(GameService);
  });

  it('creates, joins, and enforces turns', () => {
    const game1 = gameService.createGame({ playerId: 'p1', name: 'Alice', timeLimitSeconds: 60 });
    const game2 = gameService.joinGame(game1.id, { playerId: 'p2', name: 'Bob' });

    expect(game2.status).toBe('IN_PROGRESS');
    expect(game2.turnColor).toBe('WHITE');

    const afterWhite = gameService.makeMove(game2.id, {
      playerId: 'p1',
      from: { vertical: 1, horizontal: 0 },
      to: { vertical: 3, horizontal: 0 },
    });
    expect(afterWhite.turnColor).toBe('BLACK');

    expect(() =>
      gameService.makeMove(game2.id, {
        playerId: 'p1',
        from: { vertical: 1, horizontal: 1 },
        to: { vertical: 2, horizontal: 1 },
      }),
    ).toThrow();

    const afterBlack = gameService.makeMove(game2.id, {
      playerId: 'p2',
      from: { vertical: 6, horizontal: 0 },
      to: { vertical: 4, horizontal: 0 },
    });
    expect(afterBlack.turnColor).toBe('WHITE');
  });

  it('rejects illegal moves', () => {
    const game = gameService.createGame({ playerId: 'p1', name: 'Alice', timeLimitSeconds: 60 });
    gameService.joinGame(game.id, { playerId: 'p2', name: 'Bob' });

    expect(() =>
      gameService.makeMove(game.id, {
        playerId: 'p1',
        from: { vertical: 1, horizontal: 0 },
        to: { vertical: 4, horizontal: 0 },
      }),
    ).toThrow();
  });
});

