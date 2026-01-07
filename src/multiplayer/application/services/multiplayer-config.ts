export type MultiplayerConfig = {
  readyTimeoutSeconds: number;
  clockTickIntervalMs: number;
  disconnectGraceSeconds: number;
};

export const MULTIPLAYER_CONFIG_TOKEN = 'MULTIPLAYER_CONFIG_TOKEN';

export function buildMultiplayerConfig(): MultiplayerConfig {
  const readyTimeoutSeconds = clampEnvInt(process.env.READY_TIMEOUT_SECONDS, 10, 3, 60);
  const clockTickIntervalMs = clampEnvInt(process.env.CLOCK_TICK_INTERVAL_MS, 1000, 250, 5000);
  const disconnectGraceSeconds = clampEnvInt(process.env.DISCONNECT_GRACE_SECONDS, 15, 5, 60);
  return { readyTimeoutSeconds, clockTickIntervalMs, disconnectGraceSeconds };
}

function clampEnvInt(value: any, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}
