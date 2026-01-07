import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ClockPort } from '../../application/ports/clock.port';

@Injectable()
export class SystemClockAdapter implements ClockPort, OnModuleDestroy {
  private readonly timers = new Map<string, NodeJS.Timeout>();

  nowMs(): number {
    return Date.now();
  }

  schedule(taskId: string, runAtMs: number, callback: () => void): void {
    this.clear(taskId);
    const delay = Math.max(0, runAtMs - this.nowMs());
    const timer = setTimeout(() => {
      this.timers.delete(taskId);
      callback();
    }, delay);
    this.timers.set(taskId, timer);
  }

  clear(taskId: string): void {
    const timer = this.timers.get(taskId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(taskId);
    }
  }

  onModuleDestroy() {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }
}
