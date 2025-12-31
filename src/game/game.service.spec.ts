import { Test } from '@nestjs/testing';
import { PubSub } from 'graphql-subscriptions';
import { GameService } from './game.service';

describe('GameService', () => {
  let gameService: GameService;
  let pubSub: { publish: jest.Mock };

  beforeEach(async () => {
    pubSub = { publish: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        GameService,
        {
          provide: PubSub,
          useValue: pubSub,
        },
      ],
    }).compile();

    gameService = moduleRef.get(GameService);
  });

  afterEach(() => {
    gameService.onModuleDestroy();
  });

  it('creates invite game with a 7-char code and allows join by code', () => {
    const session1 = gameService.createInviteGame({
      clientId: 'c1',
      name: 'Alice',
      timeControl: { initialSeconds: 60, incrementSeconds: 0 },
    });

    expect(session1.code).toHaveLength(7);
    expect(session1.playerColor).toBe('WHITE');
    expect(session1.game.status).toBe('WAITING_FOR_PLAYERS');

    const session2 = gameService.joinInviteGame({
      clientId: 'c2',
      name: 'Bob',
      code: session1.code!,
    });

    expect(session2.gameId).toBe(session1.gameId);
    expect(session2.playerColor).toBe('BLACK');
    expect(session2.game.status).toBe('IN_PROGRESS');
    expect(session2.game.timeControl.initialSeconds).toBe(60);
  });

  it('enforces turns and rejects illegal moves', () => {
    const session1 = gameService.createInviteGame({
      clientId: 'c1',
      name: 'Alice',
      timeControl: { initialSeconds: 60, incrementSeconds: 0 },
    });
    gameService.joinInviteGame({ clientId: 'c2', name: 'Bob', code: session1.code! });

    expect(session1.game.turnColor).toBe('WHITE');

    const afterWhite = gameService.makeMoveOnline({
      clientId: 'c1',
      gameId: session1.gameId,
      from: { vertical: 1, horizontal: 0 },
      to: { vertical: 3, horizontal: 0 },
    });
    expect(afterWhite.turnColor).toBe('BLACK');

    expect(() =>
      gameService.makeMoveOnline({
        clientId: 'c1',
        gameId: session1.gameId,
        from: { vertical: 1, horizontal: 1 },
        to: { vertical: 2, horizontal: 1 },
      }),
    ).toThrow();

    expect(() =>
      gameService.makeMoveOnline({
        clientId: 'c2',
        gameId: session1.gameId,
        from: { vertical: 6, horizontal: 0 },
        to: { vertical: 5, horizontal: 0 },
      }),
    ).not.toThrow();

    expect(() =>
      gameService.makeMoveOnline({
        clientId: 'c1',
        gameId: session1.gameId,
        from: { vertical: 1, horizontal: 0 },
        to: { vertical: 4, horizontal: 0 },
      }),
    ).toThrow();
  });

  it('pairs two matchmaking clients and publishes matchFound', () => {
    const res1 = gameService.enqueueMatchmaking({
      clientId: 'a',
      name: 'A',
      timeControl: { initialSeconds: 300, incrementSeconds: 0 },
    });
    expect(res1.enqueued).toBe(true);

    const res2 = gameService.enqueueMatchmaking({
      clientId: 'b',
      name: 'B',
      timeControl: { initialSeconds: 300, incrementSeconds: 0 },
    });

    expect(res2.enqueued).toBe(false);

    const publishes = pubSub.publish.mock.calls
      .map((call) => call[1])
      .filter((payload) => payload?.matchmakingEvents?.type === 'MATCH_FOUND');

    expect(publishes).toHaveLength(2);
  });
});

