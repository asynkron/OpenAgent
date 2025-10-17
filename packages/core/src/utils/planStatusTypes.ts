export const PENDING_STATUS = 'pending' as const;
export const RUNNING_STATUS = 'running' as const;
export const COMPLETED_STATUS = 'completed' as const;
export const FAILED_STATUS = 'failed' as const;
export const ABANDONED_STATUS = 'abandoned' as const;

export const PLAN_STATUS_VALUES = [
  PENDING_STATUS,
  RUNNING_STATUS,
  COMPLETED_STATUS,
  FAILED_STATUS,
  ABANDONED_STATUS,
] as const;

export type PlanStatus = (typeof PLAN_STATUS_VALUES)[number];
export type PlanStepStatus = PlanStatus;

export const TERMINAL_PLAN_STATUS_VALUES = [
  COMPLETED_STATUS,
  FAILED_STATUS,
  ABANDONED_STATUS,
] as const;

const PLAN_STATUS_LOOKUP = new Set<PlanStatus>(PLAN_STATUS_VALUES);
const TERMINAL_PLAN_STATUS_LOOKUP = new Set<PlanStatus>(TERMINAL_PLAN_STATUS_VALUES);

export const PLAN_STATUS_SET: ReadonlySet<PlanStatus> = PLAN_STATUS_LOOKUP;
export const TERMINAL_PLAN_STATUS_SET: ReadonlySet<PlanStatus> = TERMINAL_PLAN_STATUS_LOOKUP;

export const normalizePlanStatus = (value: unknown): PlanStatus | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return PLAN_STATUS_LOOKUP.has(normalized as PlanStatus)
    ? (normalized as PlanStatus)
    : null;
};

export const isPlanStatus = (value: unknown): value is PlanStatus => normalizePlanStatus(value) !== null;
