import { Module } from '@nestjs/common';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { GraphQLModule } from '@nestjs/graphql';
import { ModuleRef } from '@nestjs/core';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MultiplayerModule } from './multiplayer/multiplayer.module';
import { GameRuntimeService } from './multiplayer/application/services/game-runtime.service';
import { GameSessionService } from './multiplayer/application/services/game-session.service';

@Module({
  imports: [
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      imports: [MultiplayerModule],
      inject: [ModuleRef],
      useFactory: (moduleRef: ModuleRef) => ({
        driver: ApolloDriver,
        autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
        sortSchema: true,
        playground: true,
        subscriptions: {
          'graphql-ws': {
            onConnect: (context) => {
              const params = (context?.connectionParams as Record<string, any>) ?? {};
              // Cyan connect log
              // eslint-disable-next-line no-console
              console.log('\x1b[36m[ws-connect]\x1b[0m', params?.clientId ?? 'unknown');
            },
            onDisconnect: (context) => {
              const params = (context?.connectionParams as Record<string, any>) ?? {};
              // Magenta disconnect log
              // eslint-disable-next-line no-console
              console.log('\x1b[35m[ws-disconnect]\x1b[0m', params?.clientId ?? 'unknown');
              const clientId = params?.clientId as string | undefined;
              if (!clientId) return;
              try {
                const sessions = moduleRef.get(GameSessionService, { strict: false });
                const runtime = moduleRef.get(GameRuntimeService, { strict: false });
                const session = sessions.findSessionByClientId?.(clientId);
                if (session && runtime?.notifyDisconnect) {
                  runtime.notifyDisconnect(session.id, clientId);
                }
              } catch {
                // ignore errors during disconnect handling
              }
            },
          },
        },
        context: ({ req, extra, connectionParams }) => ({
          req,
          extra,
          connectionParams,
        }),
      }),
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
