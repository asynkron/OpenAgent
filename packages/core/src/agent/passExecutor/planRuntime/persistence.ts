import { clonePlanForExecution, type PlanStep } from '../planExecution.js';
import type { PlanManagerAdapter } from '../planManagerAdapter.js';
import { globalRegistry } from '../planStepRegistry.js';
import type { StatusRuntimeEvent } from '../../runtimeEvents.js';

export interface PreparedIncomingPlan {
  sanitizedPlan: PlanStep[] | null;
  shouldResetRegistry: boolean;
}

export const prepareIncomingPlan = (incomingPlan: PlanStep[] | null): PreparedIncomingPlan => {
  const normalized = Array.isArray(incomingPlan) ? clonePlanForExecution(incomingPlan) : null;

  if (Array.isArray(normalized) && normalized.length === 0) {
    globalRegistry.clear();
    return { sanitizedPlan: [], shouldResetRegistry: true } satisfies PreparedIncomingPlan;
  }

  const sanitized = globalRegistry.filterCompletedSteps(normalized);
  return {
    sanitizedPlan: Array.isArray(sanitized) ? clonePlanForExecution(sanitized) : null,
    shouldResetRegistry: false,
  } satisfies PreparedIncomingPlan;
};

export interface ResolvePlanResult {
  plan: PlanStep[] | null;
  warning: StatusRuntimeEvent | null;
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
      plan: Array.isArray(sanitized) ? clonePlanForExecution(sanitized) : null,
      warning: null,
    } satisfies ResolvePlanResult;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      plan: null,
      warning: {
        type: 'status',
        payload: {
          level: 'warn',
          message: 'Failed to update persistent plan state.',
          details: message,
        },
      },
    } satisfies ResolvePlanResult;
  }
};

export interface ResetPlanResult {
  plan: PlanStep[];
  warning: StatusRuntimeEvent | null;
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
      plan: Array.isArray(cleared) ? clonePlanForExecution(cleared) : [],
      warning: null,
    } satisfies ResetPlanResult;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      plan: [],
      warning: {
        type: 'status',
        payload: {
          level: 'warn',
          message: 'Failed to clear persistent plan state after completion.',
          details: message,
        },
      },
    } satisfies ResetPlanResult;
  }
};

export const syncPlanSnapshot = async (
  planManager: PlanManagerAdapter | null,
  plan: PlanStep[],
): Promise<StatusRuntimeEvent | null> => {
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
      payload: {
        level: 'warn',
        message: 'Failed to persist plan state after execution.',
        details: message,
      },
    } satisfies StatusRuntimeEvent;
  }
};
