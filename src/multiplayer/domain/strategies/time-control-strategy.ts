import { ColorEnum } from '../engine/enums/color.enum';
import { TimeControlConfig } from '../types/time-control';

export type ClockState = {
  remainingSeconds: Record<ColorEnum, number>;
  activeColor: ColorEnum;
  lastUpdatedMs: number | null;
  incrementSeconds: number;
  running: boolean;
};

export type ClockTickResult = {
  state: ClockState;
  expiredColor?: ColorEnum | null;
};

export interface TimeControlStrategy {
  readonly id: string;
  createState(config: TimeControlConfig, nowMs: number, startsWith: ColorEnum): ClockState;
  start(state: ClockState, nowMs: number): ClockState;
  onMove(state: ClockState, byColor: ColorEnum, nowMs: number): ClockTickResult;
  tick(state: ClockState, nowMs: number): ClockTickResult;
  pause(state: ClockState): ClockState;
}
