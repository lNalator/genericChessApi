# Architecture Multiplayer

Ce module suit une architecture hexagonale (Ports & Adapters). La logique metier reste dans
`application/` et `domain/`, tandis que GraphQL, WebSocket et les stockages concrets vivent
dans `graphql/` et `infrastructure/`.

## Frontieres hexagonales
- Les services coeur (`application/services`) ne connaissent que des ports (`application/ports`)
  et des types du domaine (`src/domain`).
- Ports principaux: `GameSessionRepositoryPort`, `MatchmakingQueueRepositoryPort`, `ClockPort`,
  `DomainEventPublisherPort`, `CodeGeneratorPort`.
- Adapters: repos in-memory, `SystemClockAdapter`, `InviteCodeGenerator`,
  `ApolloDomainEventPublisherAdapter`, resolvers/mappers GraphQL.

<details>
<summary>Exemple: trajet d'une mutation</summary>

1. Resolver GraphQL recoit la requete.
2. Appel du service d'application.
3. Le service utilise des ports (repo, publisher, clock).
4. L'adapter concret effectue l'action (in-memory, pubsub, etc.).

```
mutation makeMove -> MultiplayerResolver
  -> GameRuntimeService
    -> GameSessionRepositoryPort
    -> DomainEventPublisherPort
```
</details>

## Machines d'etats
- **Matchmaking**: `IDLE -> QUEUED -> MATCH_PROPOSED -> READY -> IN_GAME`
  (sorties `FAILED`/`CANCELLED`).
- **Game session**: `CREATED -> WAITING_FOR_PLAYER -> READY_CHECK -> RUNNING -> ENDED`.
- Les transitions illegales declenchent une erreur immediatement.

<details>
<summary>Exemple: transition invalide</summary>

Si on tente `START_GAME` alors que la session n'est pas en `READY_CHECK`,
`applyGameSessionTransition` leve une erreur pour proteger l'etat.
</details>

## Evenements de domaine & subscriptions
- Evenements jeu: `SESSION_CREATED`, `PLAYER_JOINED`, `READY_CHECK_STARTED`, `PLAYER_READY`,
  `GAME_STARTED`, `MOVE_APPLIED`, `CLOCK_UPDATED`, `GAME_ENDED`, `ERROR_OCCURRED`, etc.
- Evenements matchmaking: `PLAYER_ENQUEUED`, `PLAYER_DEQUEUED`, `MATCH_PROPOSED`,
  `MATCH_FAILED`, `ERROR_OCCURRED`.
- Publies via `DomainEventPublisherPort`, exposes aux clients par `gameEvents` et
  `matchmakingEvents`.

<details>
<summary>Exemple: MOVE_APPLIED</summary>

Apres un coup valide, `GameRuntimeService`:
1) met a jour la session
2) publie `MOVE_APPLIED`
3) les clients recoivent l'event via subscription
</details>

## Controle du temps (Strategy)
- Strategie de temps dans `domain/strategies`.
- `SuddenDeathStrategy` applique un temps initial + increment.
- `GameClockTickerService` emet `CLOCK_UPDATED` toutes les X ms (env
  `CLOCK_TICK_INTERVAL_MS`).

<details>
<summary>Exemple: configuration</summary>

```
READY_TIMEOUT_SECONDS=20
CLOCK_TICK_INTERVAL_MS=1000
DISCONNECT_GRACE_SECONDS=15
```
</details>

## Handshake READY/ACK
1. Creation de session -> `READY_CHECK_STARTED` (deadline).
2. Chaque client appelle `clientReady` -> `PLAYER_READY`.
3. Tous prets avant deadline -> `GAME_STARTED` + `CLOCK_UPDATED`.
4. Deadline depassee -> `ERROR_OCCURRED` avec `READY_TIMEOUT`.

<details>
<summary>Exemple: sequence simplifiee</summary>

```
SESSION_CREATED -> READY_CHECK_STARTED
clientReady (A) -> PLAYER_READY
clientReady (B) -> PLAYER_READY
GAME_STARTED + CLOCK_UPDATED
```
</details>

## Mode bot (Stockfish)
- Demarrage via `startBotGame`.
- Le client envoie un coup -> `botMove` -> Stockfish calcule -> le backend applique
  le coup noir et renvoie l'etat du jeu.
- Pas de timer (time control a 0/0).

<details>
<summary>Exemple: flux bot</summary>

```
startBotGame -> session RUNNING
botMove (coup blanc) -> Stockfish bestMove -> apply move noir -> GameView
```
</details>

## Plan de test manuel
- **Invite**: createInviteGame -> joinInviteGame -> READY_CHECK -> clientReady -> GAME_STARTED.
- **Matchmaking**: enqueue x2 -> MATCH_PROPOSED -> clientReady -> GAME_STARTED.
- **Erreur ready**: un seul client ready -> READY_TIMEOUT -> ERROR_OCCURRED.
- **Bot**: startBotGame -> botMove -> verifier que le coup noir est applique.
