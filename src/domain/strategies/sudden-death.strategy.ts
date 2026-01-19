import { ColorEnum } from '../engine/enums/color.enum';
import { TimeControlConfig } from '../types/time-control';
import { ClockState, ClockTickResult, TimeControlStrategy } from './time-control-strategy';

function otherColor(color: ColorEnum): ColorEnum {
  switch (color) {
    case ColorEnum.WHITE:
      return ColorEnum.BLACK;
    case ColorEnum.BLACK:
      return ColorEnum.WHITE;
  }
}

function clampSeconds(value: number): number {
  return Math.max(0, Math.floor(value));
}

export class SuddenDeathStrategy implements TimeControlStrategy {
  readonly id = 'sudden-death';

  createState(config: TimeControlConfig, nowMs: number, startsWith: ColorEnum): ClockState {
    return {
      remainingSeconds: {
        [ColorEnum.WHITE]: clampSeconds(config.initialSeconds),
        [ColorEnum.BLACK]: clampSeconds(config.initialSeconds),
      },
      activeColor: startsWith,
      lastUpdatedMs: nowMs,
      incrementSeconds: clampSeconds(config.incrementSeconds),
      running: false,
    };
  }

  start(state: ClockState, nowMs: number): ClockState {
    if (state.running) return state;
    return { ...state, running: true, lastUpdatedMs: nowMs };
  }

  pause(state: ClockState): ClockState {
    return { ...state, running: false };
  }

  onMove(state: ClockState, byColor: ColorEnum, nowMs: number): ClockTickResult {
    const afterTick = this.tick(state, nowMs);
    const expired = afterTick.expiredColor;
    if (expired) return afterTick;

    const updated = { ...afterTick.state };
    updated.remainingSeconds[byColor] = clampSeconds(
      updated.remainingSeconds[byColor] + updated.incrementSeconds,
    );
    updated.activeColor = otherColor(byColor);
    updated.lastUpdatedMs = nowMs;

    return { state: updated, expiredColor: null };
  }

  tick(state: ClockState, nowMs: number): ClockTickResult {
    if (!state.running || state.lastUpdatedMs === null) {
      return { state, expiredColor: null };
    }

    const elapsedMs = Math.max(0, nowMs - state.lastUpdatedMs);
    if (elapsedMs === 0) {
      return { state, expiredColor: null };
    }

    const updated = { ...state };
    const elapsedSeconds = Math.floor(elapsedMs / 1000);
    updated.remainingSeconds = { ...state.remainingSeconds };
    updated.remainingSeconds[state.activeColor] = clampSeconds(
      state.remainingSeconds[state.activeColor] - elapsedSeconds,
    );
    updated.lastUpdatedMs = nowMs;

    const expired =
      updated.remainingSeconds[state.activeColor] <= 0 ? state.activeColor : null;

    return { state: updated, expiredColor: expired };
  }
}
