import { GameSession } from '../../domain/entities/game-session';

export const GAME_SESSION_REPOSITORY = 'GAME_SESSION_REPOSITORY';

export interface GameSessionRepositoryPort {
  save(session: GameSession): void;
  findById(gameId: string): GameSession | null;
  findByCode(code: string): GameSession | null;
  findByClientId(clientId: string): GameSession | null;
  list(): GameSession[];
  delete(gameId: string): void;
}
