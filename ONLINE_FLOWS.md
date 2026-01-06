# Online Flows (Handshake + Matchmaking)

This backend uses GraphQL subscriptions for realtime events, but it *never* starts a game/timer until both clients explicitly acknowledge readiness.

## Invite-code game: join + ready handshake

1. Client A calls `createInviteGame` → receives `{ gameId, code, playerColor=WHITE, game.status=WAITING_FOR_PLAYERS }`.
2. Client A navigates to the game screen and subscribes to `gameEvents(gameId, clientId)`.
3. Client B calls `joinInviteGame(code)` → game enters `READY_CHECK`.
4. Server emits `GAME_LOAD_REQUEST` to both clients (targeted via `targetClientId`), with:
   - `timeoutSeconds`
   - `deadlineAt`
5. Each client:
   - ensures the UI + `gameEvents` subscription are active
   - then calls `clientReady(input: { clientId, gameId })`.
6. Only after **both** `clientReady` acks:
   - server emits `GAME_STARTED`
   - server starts authoritative timers and emits `CLOCK_TICK` events.

Failure handling:
- If a client never acks before `deadlineAt`, server emits a targeted `ERROR` (`errorCode=READY_TIMEOUT`) and the game does not start.

## Matchmaking: atomic pairing + acknowledgements

1. Client calls `enqueueMatchmaking(timeControl)` and subscribes to `matchmakingEvents(clientId)`.
2. When two compatible clients are found, server creates a **pending match** and emits `MATCH_FOUND` to both:
   - includes `matchId` and `deadlineAt`.
3. Each client must ack by calling `acceptMatch(input: { clientId, matchId })`.
4. Only after **both** `acceptMatch` acks:
   - server creates the game (in `READY_CHECK`)
   - server emits `MATCH_CONFIRMED` to both with `{ gameId, playerColor, game }`
   - clients navigate to the game screen and run the same `clientReady` flow as invite-code games.

Failure handling / self-healing:
- If `MATCH_FOUND` expires: server emits `MATCH_FAILED` and re-enqueues both players automatically.
- If one client disconnects during match pending: server emits `MATCH_FAILED` to the other and re-enqueues them automatically (no manual leave/rejoin needed).
- Server never starts a game/timer until both `clientReady` acks are received.

## Bug verification checklist

### 1) Invite code: missing realtime updates (moves)
- Open two browsers (or incognito).
- A: create invite game, copy code.
- B: join by code.
- Verify both clients receive `GAME_STARTED` before any moves are allowed.
- Play moves on either side; verify the other receives `MOVE_PLAYED` events consistently.

### 2) Timers not decrementing
- After both `clientReady` acks, verify `CLOCK_TICK` events arrive and timers decrement.
- Before `GAME_STARTED`, verify timers do not tick (game remains in `READY_CHECK`).

### 3) Matchmaking queue desync / phantom games
- Open two clients, both click “Find a game”.
- Verify both receive `MATCH_FOUND`, then both call `acceptMatch`, then both receive `MATCH_CONFIRMED`.
- Kill/close one client immediately after `MATCH_FOUND`.
- Verify the remaining client receives `MATCH_FAILED` and continues searching without manual dequeue/enqueue.

### 4) Player info placement
- In `/game`, verify opponent info panel is above the board and local info is below the board.
- Verify ordering remains correct for both white and black perspectives.

