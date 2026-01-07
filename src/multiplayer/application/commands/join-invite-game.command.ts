export type JoinInviteGameCommand = {
  clientId: string;
  code: string;
  name?: string | null;
};
