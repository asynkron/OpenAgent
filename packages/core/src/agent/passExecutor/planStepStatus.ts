import type { PlanStep } from './planExecution.js';
import {
  COMPLETED_STATUS,
  FAILED_STATUS,
  PENDING_STATUS,
  RUNNING_STATUS,
  TERMINAL_PLAN_STATUS_SET,
  normalizePlanStatus,
  type PlanStepStatus,
} from '../../utils/planStatusTypes.js';

export { isCompletedStatus, isTerminalStatus } from '../../utils/planStatusUtils.js';

export { COMPLETED_STATUS, FAILED_STATUS, PENDING_STATUS, RUNNING_STATUS };
export type { PlanStepStatus };

export const hasPendingWork = (step: PlanStep | null | undefined): boolean => {
  if (!step || typeof step !== 'object') {
    return false;
  }

  const status = normalizePlanStatus(step.status);
  return !status || !TERMINAL_PLAN_STATUS_SET.has(status);
};

export const normalizeAssistantMessage = (value: unknown): string =>
  typeof value === 'string' ? value.replace(/[\u2018\u2019]/g, "'") : '';
