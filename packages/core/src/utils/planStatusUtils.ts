export type PlanStatus = 'pending' | 'running' | 'completed' | 'failed' | 'abandoned';

export const isCompletedStatus = (status: unknown): boolean => {
  if (typeof status !== 'string') {
    return false;
  }

  const normalized = status.trim().toLowerCase();
  return normalized === 'completed';
};

export const isFailedStatus = (status: unknown): boolean => {
  if (typeof status !== 'string') {
    return false;
  }

  return status.trim().toLowerCase() === 'failed';
};

export const isAbandonedStatus = (status: unknown): boolean => {
  if (typeof status !== 'string') {
    return false;
  }

  return status.trim().toLowerCase() === 'abandoned';
};

export const isTerminalStatus = (status: unknown): boolean => {
  if (typeof status !== 'string') {
    return false;
  }

  const normalized = status.trim().toLowerCase();
  return normalized === 'failed' || isCompletedStatus(normalized);
};
