import { Injectable } from '@nestjs/common';
import { GameSessionRepositoryPort } from '../../application/ports/game-session-repository.port';
import { GameSession } from '../../../domain/entities/game-session';

@Injectable()
export class InMemoryGameSessionRepository implements GameSessionRepositoryPort {
  private readonly sessions = new Map<string, GameSession>();
  private readonly codeIndex = new Map<string, string>();

  save(session: GameSession): void {
    this.sessions.set(session.id, session);
    if (session.code) {
      this.codeIndex.set(session.code.toUpperCase(), session.id);
    }
  }

  findById(gameId: string): GameSession | null {
    return this.sessions.get(gameId) ?? null;
  }

  findByCode(code: string): GameSession | null {
    const id = this.codeIndex.get(code.toUpperCase());
    if (!id) return null;
    return this.sessions.get(id) ?? null;
  }

  findByClientId(clientId: string): GameSession | null {
    for (const session of this.sessions.values()) {
      if (session.players.some((p) => p.id === clientId)) {
        return session;
      }
    }
    return null;
  }

  list(): GameSession[] {
    return [...this.sessions.values()];
  }

  delete(gameId: string): void {
    const session = this.sessions.get(gameId);
    if (!session) return;
    this.sessions.delete(gameId);
    if (session.code) {
      this.codeIndex.delete(session.code.toUpperCase());
    }
  }
}
