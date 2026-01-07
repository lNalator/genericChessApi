import { randomBytes, randomUUID } from 'crypto';
import { CodeGeneratorPort } from '../../application/ports/code-generator.port';

function randomCode(len: number): string {
  const bytes = randomBytes(len);
  return [...bytes]
    .map((b) => (b % 36).toString(36))
    .join('')
    .slice(0, len)
    .toUpperCase();
}

export class InviteCodeGenerator implements CodeGeneratorPort {
  generateGameId(): string {
    return randomUUID();
  }

  generateMatchId(): string {
    return randomUUID();
  }

  generateInviteCode(): string {
    return randomCode(7);
  }
}
