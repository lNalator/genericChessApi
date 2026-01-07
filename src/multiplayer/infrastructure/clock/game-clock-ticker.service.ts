import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { GameRuntimeService } from '../../application/services/game-runtime.service';
import { MULTIPLAYER_CONFIG_TOKEN, MultiplayerConfig } from '../../application/services/multiplayer-config';

@Injectable()
export class GameClockTickerService implements OnModuleInit, OnModuleDestroy {
  private interval: NodeJS.Timeout | null = null;

  constructor(
    private readonly runtime: GameRuntimeService,
    @Inject(MULTIPLAYER_CONFIG_TOKEN) private readonly config: MultiplayerConfig,
  ) {}

  onModuleInit() {
    this.interval = setInterval(() => this.runtime.tick(), this.config.clockTickIntervalMs);
  }

  onModuleDestroy() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}
