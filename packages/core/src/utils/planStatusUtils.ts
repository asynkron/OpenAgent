import {
  ABANDONED_STATUS,
  COMPLETED_STATUS,
  FAILED_STATUS,
  TERMINAL_PLAN_STATUS_SET,
  type PlanStatus,
} from './planStatusTypes.js';

export type { PlanStatus } from './planStatusTypes.js';

export const isCompletedStatus = (status: PlanStatus | null | undefined): status is typeof COMPLETED_STATUS =>
  status === COMPLETED_STATUS;

export const isFailedStatus = (status: PlanStatus | null | undefined): status is typeof FAILED_STATUS =>
  status === FAILED_STATUS;

export const isAbandonedStatus = (status: PlanStatus | null | undefined): status is typeof ABANDONED_STATUS =>
  status === ABANDONED_STATUS;

export const isTerminalStatus = (status: PlanStatus | null | undefined): boolean => {
  if (!status) {
    return false;
  }

  return TERMINAL_PLAN_STATUS_SET.has(status);
};
