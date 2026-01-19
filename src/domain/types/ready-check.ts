export enum ReadyCheckStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export type ReadyCheckState = {
  requiredClientIds: string[];
  readyClientIds: Set<string>;
  deadlineAt: Date | null;
  status: ReadyCheckStatus;
};
