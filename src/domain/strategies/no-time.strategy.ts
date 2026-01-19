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

export class NoTimeStrategy implements TimeControlStrategy {
  readonly id = 'no-time';

  createState(_config: TimeControlConfig, nowMs: number, startsWith: ColorEnum): ClockState {
    return {
      remainingSeconds: {
        [ColorEnum.WHITE]: 0,
        [ColorEnum.BLACK]: 0,
      },
      activeColor: startsWith,
      lastUpdatedMs: nowMs,
      incrementSeconds: 0,
      running: false,
    };
  }

  start(state: ClockState, nowMs: number): ClockState {
    return { ...state, running: false, lastUpdatedMs: nowMs };
  }

  pause(state: ClockState): ClockState {
    return { ...state, running: false };
  }

  onMove(state: ClockState, byColor: ColorEnum, nowMs: number): ClockTickResult {
    const updated: ClockState = {
      ...state,
      remainingSeconds: { ...state.remainingSeconds },
      activeColor: otherColor(byColor),
      lastUpdatedMs: nowMs,
      running: false,
    };
    return { state: updated, expiredColor: null };
  }

  tick(state: ClockState, _nowMs: number): ClockTickResult {
    return { state, expiredColor: null };
  }
}
