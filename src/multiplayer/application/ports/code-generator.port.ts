export interface CodeGeneratorPort {
  generateGameId(): string;
  generateMatchId(): string;
  generateInviteCode(): string;
}

export const CODE_GENERATOR_PORT = 'CODE_GENERATOR_PORT';
