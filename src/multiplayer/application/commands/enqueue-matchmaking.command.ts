import { TimeControlConfig } from '../../domain/types/time-control';

export type EnqueueMatchmakingCommand = {
  clientId: string;
  name?: string | null;
  timeControl: TimeControlConfig;
};
