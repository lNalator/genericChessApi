import { Test } from '@nestjs/testing';
import { PubSub } from 'graphql-subscriptions';
import { GameDomainService } from './domain/game-domain.service';
import { MatchmakingDomainService } from './domain/matchmaking-domain.service';
import { GameEventBusService } from './realtime/game-event-bus.service';
import { GameRealtimeService } from './realtime/game-realtime.service';

describe('GameRealtimeService', () => {
  let gameRealtime: GameRealtimeService;
  let pubSub: { publish: jest.Mock };

  beforeEach(async () => {
    pubSub = { publish: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        GameDomainService,
        MatchmakingDomainService,
        GameEventBusService,
        GameRealtimeService,
        {
          provide: PubSub,
          useValue: pubSub,
        },
      ],
    }).compile();

    gameRealtime = moduleRef.get(GameRealtimeService);
  });

  afterEach(() => {
    gameRealtime.onModuleDestroy();
  });

  it('creates invite game with a 7-char code and starts only after both clientReady', () => {
    const session1 = gameRealtime.createInviteGame({
      clientId: 'c1',
      name: 'Alice',
      timeControl: { initialSeconds: 60, incrementSeconds: 0 },
    });

    expect(session1.code).toHaveLength(7);
    expect(session1.playerColor).toBe('WHITE');
    expect(session1.game.status).toBe('WAITING_FOR_PLAYERS');

    const session2 = gameRealtime.joinInviteGame({
      clientId: 'c2',
      name: 'Bob',
      code: session1.code!,
    });

    expect(session2.gameId).toBe(session1.gameId);
    expect(session2.playerColor).toBe('BLACK');
    expect(session2.game.status).toBe('READY_CHECK');
    expect(session2.game.timeControl.initialSeconds).toBe(60);

    // Not started yet: moves are rejected.
    expect(() =>
      gameRealtime.makeMove({
        clientId: 'c1',
        gameId: session1.gameId,
        from: { vertical: 1, horizontal: 0 },
        to: { vertical: 3, horizontal: 0 },
      }),
    ).toThrow();

    gameRealtime.clientReady(session1.gameId, 'c1');
    expect(gameRealtime.getGameSession(session1.gameId, 'c1').game.status).toBe('READY_CHECK');

    gameRealtime.clientReady(session1.gameId, 'c2');
    expect(gameRealtime.getGameSession(session1.gameId, 'c1').game.status).toBe('IN_PROGRESS');
  });

  it('enforces turns and rejects illegal moves', () => {
    const session1 = gameRealtime.createInviteGame({
      clientId: 'c1',
      name: 'Alice',
      timeControl: { initialSeconds: 60, incrementSeconds: 0 },
    });
    gameRealtime.joinInviteGame({ clientId: 'c2', name: 'Bob', code: session1.code! });
    gameRealtime.clientReady(session1.gameId, 'c1');
    gameRealtime.clientReady(session1.gameId, 'c2');

    expect(session1.game.turnColor).toBe('WHITE');

    const afterWhite = gameRealtime.makeMove({
      clientId: 'c1',
      gameId: session1.gameId,
      from: { vertical: 1, horizontal: 0 },
      to: { vertical: 3, horizontal: 0 },
    });
    expect(afterWhite.turnColor).toBe('BLACK');

    expect(() =>
      gameRealtime.makeMove({
        clientId: 'c1',
        gameId: session1.gameId,
        from: { vertical: 1, horizontal: 1 },
        to: { vertical: 2, horizontal: 1 },
      }),
    ).toThrow();

    expect(() =>
      gameRealtime.makeMove({
        clientId: 'c2',
        gameId: session1.gameId,
        from: { vertical: 6, horizontal: 0 },
        to: { vertical: 5, horizontal: 0 },
      }),
    ).not.toThrow();

    expect(() =>
      gameRealtime.makeMove({
        clientId: 'c1',
        gameId: session1.gameId,
        from: { vertical: 1, horizontal: 0 },
        to: { vertical: 4, horizontal: 0 },
      }),
    ).toThrow();
  });

  it('pairs two matchmaking clients, requires acceptMatch, and publishes matchConfirmed', () => {
    const res1 = gameRealtime.enqueueMatchmaking({
      clientId: 'a',
      name: 'A',
      timeControl: { initialSeconds: 300, incrementSeconds: 0 },
    });
    expect(res1.enqueued).toBe(true);

    const res2 = gameRealtime.enqueueMatchmaking({
      clientId: 'b',
      name: 'B',
      timeControl: { initialSeconds: 300, incrementSeconds: 0 },
    });

    expect(res2.enqueued).toBe(false);

    const publishes = pubSub.publish.mock.calls
      .map((call) => call[1])
      .filter((payload) => payload?.matchmakingEvents?.type === 'MATCH_FOUND');

    expect(publishes).toHaveLength(2);
    const matchId = publishes[0]?.matchmakingEvents?.matchId as string;
    expect(typeof matchId).toBe('string');

    gameRealtime.acceptMatch('a', matchId);
    gameRealtime.acceptMatch('b', matchId);

    const confirmed = pubSub.publish.mock.calls
      .map((call) => call[1])
      .filter((payload) => payload?.matchmakingEvents?.type === 'MATCH_CONFIRMED');

    expect(confirmed).toHaveLength(2);
  });
});
