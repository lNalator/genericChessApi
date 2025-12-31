import { Module } from '@nestjs/common';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { GraphQLModule } from '@nestjs/graphql';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { GameModule } from './game/game.module';
import { GameService } from './game/game.service';

@Module({
  imports: [
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      imports: [GameModule],
      inject: [GameService],
      useFactory: (gameService: GameService) => ({
        driver: ApolloDriver,
        autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
        sortSchema: true,
        playground: true,
        subscriptions: {
          'graphql-ws': {
            onConnect: (context: any) => {
              const clientId = context?.connectionParams?.clientId;
              if (typeof clientId === 'string') {
                context.extra = context.extra ?? {};
                context.extra.clientId = clientId;
                gameService.handleClientConnected(clientId);
              }
              // eslint-disable-next-line no-console
              console.log('[graphql-ws] connect', { clientId });
            },
            onDisconnect: (context: any) => {
              const clientId = context?.connectionParams?.clientId ?? context?.extra?.clientId;
              if (typeof clientId === 'string') {
                gameService.handleClientDisconnected(clientId);
              }
              // eslint-disable-next-line no-console
              console.log('[graphql-ws] disconnect', { clientId });
            },
          },
        },
      }),
    }),
    GameModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
