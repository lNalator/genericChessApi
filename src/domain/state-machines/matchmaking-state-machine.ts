import { MatchmakingState } from '../types/matchmaking-state.enum';

export enum MatchmakingTransitionType {
  ENQUEUE = 'ENQUEUE',
  PROPOSE_MATCH = 'PROPOSE_MATCH',
  READY = 'READY',
  IN_GAME = 'IN_GAME',
  FAIL = 'FAIL',
  CANCEL = 'CANCEL',
}

export type MatchmakingTransition = {
  type: MatchmakingTransitionType;
};

export function applyMatchmakingTransition(
  current: MatchmakingState,
  transition: MatchmakingTransition,
): MatchmakingState {
  switch (transition.type) {
    case MatchmakingTransitionType.ENQUEUE:
      if (current !== MatchmakingState.IDLE && current !== MatchmakingState.CANCELLED) {
        throw new Error(`Invalid transition ENQUEUE from ${current}`);
      }
      return MatchmakingState.QUEUED;
    case MatchmakingTransitionType.PROPOSE_MATCH:
      if (current !== MatchmakingState.QUEUED) {
        throw new Error(`Invalid transition PROPOSE_MATCH from ${current}`);
      }
      return MatchmakingState.MATCH_PROPOSED;
    case MatchmakingTransitionType.READY:
      if (current !== MatchmakingState.MATCH_PROPOSED) {
        throw new Error(`Invalid transition READY from ${current}`);
      }
      return MatchmakingState.READY;
    case MatchmakingTransitionType.IN_GAME:
      if (current !== MatchmakingState.READY && current !== MatchmakingState.MATCH_PROPOSED) {
        throw new Error(`Invalid transition IN_GAME from ${current}`);
      }
      return MatchmakingState.IN_GAME;
    case MatchmakingTransitionType.FAIL:
      if (
        current !== MatchmakingState.MATCH_PROPOSED &&
        current !== MatchmakingState.READY &&
        current !== MatchmakingState.QUEUED
      ) {
        throw new Error(`Invalid transition FAIL from ${current}`);
      }
      return MatchmakingState.FAILED;
    case MatchmakingTransitionType.CANCEL:
      if (current === MatchmakingState.IN_GAME) {
        throw new Error('Cannot cancel while in game');
      }
      return MatchmakingState.CANCELLED;
  }
}
