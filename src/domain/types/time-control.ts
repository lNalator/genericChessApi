export type TimeControlConfig = {
  initialSeconds: number;
  incrementSeconds: number;
};

export const DEFAULT_TIME_CONTROL: TimeControlConfig = {
  initialSeconds: 300,
  incrementSeconds: 0,
};

export function normalizeTimeControl(input: TimeControlConfig): TimeControlConfig {
  const initialSeconds = Math.max(1, Math.floor(input.initialSeconds ?? DEFAULT_TIME_CONTROL.initialSeconds));
  const incrementSeconds = Math.max(0, Math.floor(input.incrementSeconds ?? DEFAULT_TIME_CONTROL.incrementSeconds));
  return { initialSeconds, incrementSeconds };
}

export function timeControlKey(tc: TimeControlConfig): string {
  return `${tc.initialSeconds}-${tc.incrementSeconds}`;
}
