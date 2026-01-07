export interface ClockPort {
  nowMs(): number;
  schedule(taskId: string, runAtMs: number, callback: () => void): void;
  clear(taskId: string): void;
}

export const CLOCK_PORT = 'CLOCK_PORT';
