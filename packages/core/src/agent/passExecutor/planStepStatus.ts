import type { PlanStep } from './planExecution.js';

export type PlanStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'abandoned';

export const COMPLETED_STATUS: PlanStepStatus = 'completed';
export const RUNNING_STATUS: PlanStepStatus = 'running';
export const FAILED_STATUS: PlanStepStatus = 'failed';
export const PENDING_STATUS: PlanStepStatus = 'pending';

export const isCompletedStatus = (status: unknown): boolean =>
  typeof status === 'string' && status.trim().toLowerCase() === COMPLETED_STATUS;

export const isTerminalStatus = (status: unknown): boolean => {
  if (typeof status !== 'string') {
    return false;
  }
  const normalized = status.trim().toLowerCase();
  return normalized === 'completed' || normalized === 'failed' || normalized === 'abandoned';
};

export const hasPendingWork = (step: PlanStep | null | undefined): boolean => {
  if (!step || typeof step !== 'object') {
    return false;
  }

  const status = typeof step.status === 'string' ? step.status.trim().toLowerCase() : '';
  return !isTerminalStatus(status);
};

export const normalizeAssistantMessage = (value: unknown): string =>
  typeof value === 'string' ? value.replace(/[\u2018\u2019]/g, "'") : '';
