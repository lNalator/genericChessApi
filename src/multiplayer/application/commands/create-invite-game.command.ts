import { TimeControlConfig } from '../../domain/types/time-control';

export type CreateInviteGameCommand = {
  clientId: string;
  name?: string | null;
  timeControl: TimeControlConfig;
};
