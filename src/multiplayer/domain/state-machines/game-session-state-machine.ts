import { GameSessionState } from '../types/game-session-state.enum';

export enum GameSessionTransitionType {
  START_READY_CHECK = 'START_READY_CHECK',
  START_GAME = 'START_GAME',
  READY_FAILED = 'READY_FAILED',
  END_GAME = 'END_GAME',
}

export type GameSessionTransition = {
  type: GameSessionTransitionType;
};

export function applyGameSessionTransition(
  current: GameSessionState,
  transition: GameSessionTransition,
): GameSessionState {
  switch (transition.type) {
    case GameSessionTransitionType.START_READY_CHECK:
      if (current !== GameSessionState.WAITING_FOR_PLAYER) {
        throw new Error(`Invalid transition START_READY_CHECK from ${current}`);
      }
      return GameSessionState.READY_CHECK;
    case GameSessionTransitionType.START_GAME:
      if (current !== GameSessionState.READY_CHECK) {
        throw new Error(`Invalid transition START_GAME from ${current}`);
      }
      return GameSessionState.RUNNING;
    case GameSessionTransitionType.READY_FAILED:
      if (current !== GameSessionState.READY_CHECK) {
        throw new Error(`Invalid transition READY_FAILED from ${current}`);
      }
      return GameSessionState.ENDED;
    case GameSessionTransitionType.END_GAME:
      if (current !== GameSessionState.RUNNING && current !== GameSessionState.READY_CHECK) {
        throw new Error(`Invalid transition END_GAME from ${current}`);
      }
      return GameSessionState.ENDED;
  }
}
