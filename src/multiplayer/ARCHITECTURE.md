# Multiplayer Architecture

## Hexagonal boundaries
- Core services (`application/services`) depend only on ports (`application/ports`) and domain types. No GraphQL/WebSocket details leak into domain logic.
- Ports: `GameSessionRepositoryPort`, `MatchmakingQueueRepositoryPort`, `ClockPort`, `DomainEventPublisherPort`, `CodeGeneratorPort`.
- Adapters: in-memory repositories, `SystemClockAdapter`, `InviteCodeGenerator`, and `ApolloDomainEventPublisherAdapter`. GraphQL resolver/mappers are thin adapters calling command-style services.

## State machines
- **Matchmaking**: `IDLE -> QUEUED -> MATCH_PROPOSED -> READY -> IN_GAME`, with failure exits `FAILED`/`CANCELLED`. Transitions are validated in `applyMatchmakingTransition`.
- **Game session**: `CREATED -> WAITING_FOR_PLAYER -> READY_CHECK -> RUNNING -> ENDED`. Illegal transitions throw immediately via `applyGameSessionTransition`.

## Domain events → subscriptions
- Game events: `SESSION_CREATED`, `PLAYER_JOINED`, `READY_CHECK_STARTED` (LOAD_SESSION payload), `PLAYER_READY`, `GAME_STARTED`, `MOVE_APPLIED`, `CLOCK_UPDATED`, `GAME_ENDED`, `ERROR_OCCURRED`. Published through `DomainEventPublisherPort` and exposed by the `gameEvents` subscription.
- Matchmaking events: `PLAYER_ENQUEUED`, `PLAYER_DEQUEUED`, `MATCH_PROPOSED`, `MATCH_FAILED`, `ERROR_OCCURRED` exposed via `matchmakingEvents`.

## Time control strategy
- Strategy pattern in `domain/strategies`. `SuddenDeathStrategy` drives authoritative clocks (initial + increment) and returns expiration information on `tick`/`onMove`.
- `GameClockTickerService` ticks every `CLOCK_TICK_INTERVAL_MS` (configurable env) to emit `CLOCK_UPDATED` while running games stay in sync.

## Ready/ack handshake
1. Session created or match paired → `READY_CHECK_STARTED` (LOAD_SESSION) targeted to both players, includes deadline.
2. Each client calls `clientReady` (validated) → emits `PLAYER_READY`.
3. When all required clients ack before deadline → `GAME_STARTED` + initial `CLOCK_UPDATED`; timers begin.
4. If deadline passes first → `ERROR_OCCURRED` with `errorCode=READY_TIMEOUT`; game never starts.

## Manual test plan
- **Invite flow**: createInviteGame → subscribe `gameEvents` for both → joinInviteGame with code → ensure LOAD_SESSION + clientReady from both → expect GAME_STARTED then MOVE_APPLIED + CLOCK_UPDATED on moves.
- **Matchmaking flow**: enqueue two clients with same time control → expect MATCH_PROPOSED to each including gameId/color → subscribe `gameEvents` and send clientReady → play moves and verify mirrored events.
- **Handshake failure**: start match/invite, have only one client call clientReady → wait past deadline → expect targeted `ERROR_OCCURRED (READY_TIMEOUT)` and no GAME_STARTED.
- **Reliability (second player moves/timers)**: after both ready, play alternating moves; verify other client receives MOVE_APPLIED and CLOCK_UPDATED every second from ticker.
