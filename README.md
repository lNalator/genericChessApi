<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://coveralls.io/github/nestjs/nest?branch=master" target="_blank"><img src="https://coveralls.io/repos/github/nestjs/nest/badge.svg?branch=master#9" alt="Coverage" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## GraphQL realtime chess API (added)

- HTTP GraphQL endpoint: `http://localhost:3001/graphql`
- WebSocket subscriptions endpoint: `ws://localhost:3001/graphql` (protocol: `graphql-transport-ws`)
- Storage: in-memory (no DB yet)
- Auth: none (client provides a stable `clientId` stored in localStorage)

### Run

```bash
npm install
npm run start:dev
```

Default port is `3001` (configurable via `PORT`).

Disconnect/quit grace is configurable via `DISCONNECT_GRACE_SECONDS` (default `15`, clamped to `1..15`).

### Sample operations

Create an invite game (returns a 7-char code):

```graphql
mutation CreateInviteGame {
  createInviteGame(
    input: { clientId: "c1", name: "Alice", timeControl: { initialSeconds: 300 } }
  ) {
    gameId
    code
    playerColor
    game { id code status turnColor timeControl { initialSeconds incrementSeconds } }
  }
}
```

Join by code:

```graphql
mutation JoinInviteGame($code: String!) {
  joinInviteGame(input: { clientId: "c2", name: "Bob", code: $code }) {
    gameId
    playerColor
  }
}
```

Make a move (coordinates are `{ vertical: 0..7, horizontal: 0..7 }`):

```graphql
mutation MakeMove($gameId: ID!) {
  makeMove(input: {
    clientId: "c1"
    gameId: $gameId
    from: { vertical: 1, horizontal: 4 }
    to: { vertical: 3, horizontal: 4 }
  }) {
    id
    turnColor
    timeControl { initialSeconds incrementSeconds }
    state { hasGameEnded players { id color time isPlaying } }
  }
}
```

Subscribe to per-game events:

```graphql
subscription GameEvents($gameId: ID!, $clientId: ID!) {
  gameEvents(gameId: $gameId, clientId: $clientId) {
    type
    at
    message
    move { byPlayerId from { vertical horizontal } to { vertical horizontal } }
    game { id code status turnColor timeControl { initialSeconds incrementSeconds } }
  }
}
```

Subscribe to matchmaking events:

```graphql
subscription MatchmakingEvents($clientId: ID!) {
  matchmakingEvents(clientId: $clientId) {
    type
    at
    gameId
    playerColor
    game { id status turnColor }
  }
}
```

### Event semantics

- `CLOCK_TICK`: emitted periodically during active games (authoritative timers)
- `PLAYER_JOINED`: emitted on invite create/join
- `PLAYER_DISCONNECTED`: emitted on explicit `quitGame` and on WebSocket disconnect (includes `graceSeconds` + `deadlineAt`)
- `PLAYER_RECONNECTED`: emitted if the player reconnects before the grace deadline
- `MOVE_PLAYED`: emitted after a successful `makeMove`
- `GAME_STARTED`: emitted when the 2nd player joins an invite game
- `GAME_ENDED`: emitted on checkmate/stalemate/timeout/opponentQuit (grace expiry ends as resignation)
- `REMATCH_*`: negotiation + restart events (colors swapped on `REMATCH_STARTED`)

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
