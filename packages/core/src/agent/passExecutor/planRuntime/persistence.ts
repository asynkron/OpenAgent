import { clonePlanForExecution, type PlanStep } from '../planExecution.js';
import type { PlanManagerAdapter } from '../planManagerAdapter.js';
import { globalRegistry } from '../planStepRegistry.js';
import { PENDING_STATUS, normalizePlanStatus } from '../../../utils/planStatusTypes.js';

// Normalizes arbitrary status payloads into the constrained PlanStatus union so
// downstream state-machine logic never sees unexpected strings from assistant
// responses or persisted snapshots.
const normalizePlanStepStatus = (step: PlanStep | null | undefined): void => {
  if (!step || typeof step !== 'object') {
    return;
  }

  const statusCandidate = step.status;
  const normalized = normalizePlanStatus(statusCandidate);
  step.status = normalized ?? PENDING_STATUS;
};

const normalizePlanStatuses = (plan: PlanStep[] | null | undefined): void => {
  if (!Array.isArray(plan)) {
    return;
  }

  plan.forEach((step) => normalizePlanStepStatus(step));
};

const cloneNormalizedPlan = (plan: PlanStep[] | null | undefined): PlanStep[] => {
  const cloned = clonePlanForExecution(plan);
  normalizePlanStatuses(cloned);
  return cloned;
};

const cloneNormalizedPlanOrNull = (
  plan: PlanStep[] | null | undefined,
): PlanStep[] | null => {
  if (!Array.isArray(plan)) {
    return null;
  }

  return cloneNormalizedPlan(plan);
};

export interface RuntimeStatusEvent {
  type: 'status';
  level: 'info' | 'warn' | 'error';
  message: string;
  details?: string;
}

export interface PreparedIncomingPlan {
  sanitizedPlan: PlanStep[] | null;
  shouldResetRegistry: boolean;
}

export const prepareIncomingPlan = (incomingPlan: PlanStep[] | null): PreparedIncomingPlan => {
  const normalized = cloneNormalizedPlanOrNull(incomingPlan);

  if (Array.isArray(normalized) && normalized.length === 0) {
    globalRegistry.clear();
    return { sanitizedPlan: [], shouldResetRegistry: true } satisfies PreparedIncomingPlan;
  }

  const sanitized = globalRegistry.filterCompletedSteps(normalized);
  return {
    sanitizedPlan: Array.isArray(sanitized) ? cloneNormalizedPlan(sanitized) : null,
    shouldResetRegistry: false,
  } satisfies PreparedIncomingPlan;
};

export interface ResolvePlanResult {
  plan: PlanStep[] | null;
  warning: RuntimeStatusEvent | null;
}

export const resolveActivePlan = async (
  planManager: PlanManagerAdapter | null,
  normalizedIncoming: PlanStep[] | null,
): Promise<ResolvePlanResult> => {
  if (!planManager) {
    return { plan: null, warning: null } satisfies ResolvePlanResult;
  }

  try {
    const resolved = await planManager.resolveActivePlan(normalizedIncoming);
    const sanitized = globalRegistry.filterCompletedSteps(resolved);
    return {
      plan: Array.isArray(sanitized) ? cloneNormalizedPlan(sanitized) : null,
      warning: null,
    } satisfies ResolvePlanResult;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      plan: null,
      warning: {
        type: 'status',
        level: 'warn',
        message: 'Failed to update persistent plan state.',
        details: message,
      },
    } satisfies ResolvePlanResult;
  }
};

export interface ResetPlanResult {
  plan: PlanStep[];
  warning: RuntimeStatusEvent | null;
}

export const resetPersistedPlan = async (
  planManager: PlanManagerAdapter | null,
): Promise<ResetPlanResult> => {
  globalRegistry.clear();

  if (!planManager) {
    return { plan: [], warning: null } satisfies ResetPlanResult;
  }

  try {
    const cleared = await planManager.resetPlanSnapshot();
    return {
      plan: Array.isArray(cleared) ? cloneNormalizedPlan(cleared) : [],
      warning: null,
    } satisfies ResetPlanResult;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      plan: [],
      warning: {
        type: 'status',
        level: 'warn',
        message: 'Failed to clear persistent plan state after completion.',
        details: message,
      },
    } satisfies ResetPlanResult;
  }
};

export const syncPlanSnapshot = async (
  planManager: PlanManagerAdapter | null,
  plan: PlanStep[],
): Promise<RuntimeStatusEvent | null> => {
  if (!planManager) {
    return null;
  }

  try {
    await planManager.syncPlanSnapshot(plan);
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      type: 'status',
      level: 'warn',
      message: 'Failed to persist plan state after execution.',
      details: message,
    } satisfies RuntimeStatusEvent;
  }
};
