import { clonePlanForExecution, type PlanStep } from './planExecution.js';

type PlanResult = PlanStep[] | null | undefined | Promise<PlanStep[] | null | undefined>;

export interface PlanManagerLike {
  isMergingEnabled?: () => boolean | Promise<boolean>;
  update?: (plan: PlanStep[] | null | undefined) => PlanResult;
  get?: () => PlanResult;
  reset?: () => PlanResult;
  sync?: (plan: PlanStep[] | null | undefined) => void | Promise<void>;
}

export interface PlanManagerAdapter {
  resolveActivePlan: (incomingPlan: PlanStep[] | null) => Promise<PlanStep[] | null>;
  resetPlanSnapshot: () => Promise<PlanStep[] | null>;
  syncPlanSnapshot: (plan: PlanStep[]) => Promise<void>;
}

const sanitizePlanArray = (value: unknown): PlanStep[] | null => {
  if (!value) {
    return null;
  }

  if (!Array.isArray(value)) {
    return null;
  }

  const plan: PlanStep[] = [];
  for (const item of value) {
    if (item && typeof item === 'object') {
      plan.push(item as PlanStep);
    }
  }

  return plan.length > 0 ? clonePlanForExecution(plan) : [];
};

type PlanSupplier = () => PlanResult;
type PlanUpdater = (plan: PlanStep[] | null | undefined) => PlanResult;

export const createPlanManagerAdapter = (
  manager: PlanManagerLike | null | undefined,
): PlanManagerAdapter | null => {
  if (!manager || (typeof manager !== 'object' && typeof manager !== 'function')) {
    return null;
  }

  const isMergingEnabledFn =
    typeof manager.isMergingEnabled === 'function' ? manager.isMergingEnabled.bind(manager) : null;
  const updateFn = typeof manager.update === 'function' ? manager.update.bind(manager) : null;
  const getFn = typeof manager.get === 'function' ? manager.get.bind(manager) : null;
  const resetFn = typeof manager.reset === 'function' ? manager.reset.bind(manager) : null;
  const syncFn = typeof manager.sync === 'function' ? manager.sync.bind(manager) : null;

  const ensurePlan = async (candidate: PlanSupplier | null): Promise<PlanStep[] | null> => {
    if (!candidate) {
      return null;
    }

    const value = await candidate();
    const sanitized = sanitizePlanArray(value);
    return sanitized;
  };

  const ensurePlanWithArg = async (
    candidate: PlanUpdater | null,
    plan: PlanStep[] | null,
  ): Promise<PlanStep[] | null> => {
    if (!candidate) {
      return plan;
    }

    const planForConsumer = plan ? clonePlanForExecution(plan) : null;
    const value = await candidate(planForConsumer ?? undefined);
    const sanitized = sanitizePlanArray(value);
    return sanitized ?? plan;
  };

  const isMergingEnabled = async (): Promise<boolean> => {
    if (!isMergingEnabledFn) {
      return true;
    }

    const result = await isMergingEnabledFn();
    return result !== false;
  };

  return {
    resolveActivePlan: async (incomingPlan) => {
      const basePlan = incomingPlan ? clonePlanForExecution(incomingPlan) : null;

      if (basePlan) {
        // Let hosts merge/update the incoming plan even when the payload is empty. This keeps
        // the adapter aligned with the historic JS behavior where `update()` always fired.
        return ensurePlanWithArg(updateFn, basePlan);
      }

      if (await isMergingEnabled()) {
        return ensurePlan(getFn);
      }

      return ensurePlan(resetFn);
    },
    resetPlanSnapshot: () => ensurePlan(resetFn),
    syncPlanSnapshot: async (plan) => {
      if (!syncFn) {
        return;
      }

      await syncFn(clonePlanForExecution(plan));
    },
  };
};
