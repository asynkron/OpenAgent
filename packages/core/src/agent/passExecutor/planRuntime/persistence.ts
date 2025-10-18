import { clonePlanForExecution, type PlanStep } from '../planExecution.js';
import type { PlanManagerAdapter } from '../planManagerAdapter.js';
import { globalRegistry } from '../planStepRegistry.js';
import type { StatusLevel, StatusRuntimeEvent } from '../../runtimeEvents.js';

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

function buildStatusWarning(
  level: StatusLevel,
  message: string,
  details: string | null,
): StatusRuntimeEvent {
  return {
    type: 'status',
    payload: { level, message, details },
    // Legacy top-level fields for compatibility with tests and lightweight UIs
    // These extra fields are tolerated by downstream consumers that read from payload
    // while enabling direct access (e.g., warning.message) in unit tests.
    level,
    message,
    details,
  } as unknown as StatusRuntimeEvent;
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
      warning: buildStatusWarning('warn', 'Failed to update persistent plan state.', message),
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
      warning: buildStatusWarning(
        'warn',
        'Failed to clear persistent plan state after completion.',
        message,
      ),
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
    return buildStatusWarning('warn', 'Failed to persist plan state after execution.', message);
  }
};
