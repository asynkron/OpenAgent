import {
  ABANDONED_STATUS,
  COMPLETED_STATUS,
  FAILED_STATUS,
  TERMINAL_PLAN_STATUS_SET,
  normalizePlanStatus,
  type PlanStatus,
} from './planStatusTypes.js';

export type { PlanStatus } from './planStatusTypes.js';

export const isCompletedStatus = (status: unknown): boolean =>
  normalizePlanStatus(status) === COMPLETED_STATUS;

export const isFailedStatus = (status: unknown): boolean =>
  normalizePlanStatus(status) === FAILED_STATUS;

export const isAbandonedStatus = (status: unknown): boolean =>
  normalizePlanStatus(status) === ABANDONED_STATUS;

export const isTerminalStatus = (status: unknown): boolean => {
  const normalized = normalizePlanStatus(status);
  if (!normalized) {
    return false;
  }

  return TERMINAL_PLAN_STATUS_SET.has(normalized);
};
