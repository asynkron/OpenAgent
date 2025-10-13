import type { PlanStep } from './planExecution.js';

export interface PlanManagerLike {
  isMergingEnabled?: () => boolean | Promise<boolean>;
  update?: (plan: PlanStep[] | null | undefined) => PlanStep[] | null | undefined | Promise<PlanStep[] | null | undefined>;
  get?: () => PlanStep[] | null | undefined | Promise<PlanStep[] | null | undefined>;
  reset?: () => PlanStep[] | null | undefined | Promise<PlanStep[] | null | undefined>;
  sync?: (plan: PlanStep[] | null | undefined) => void | Promise<void>;
}

export interface PlanManagerAdapter {
  resolveActivePlan: (incomingPlan: PlanStep[] | null) => Promise<PlanStep[] | null>;
  resetPlanSnapshot: () => Promise<PlanStep[] | null>;
  syncPlanSnapshot: (plan: PlanStep[]) => Promise<void>;
}

const toPlanArray = (value: unknown): PlanStep[] | null =>
  Array.isArray(value) ? (value as PlanStep[]) : null;

export const createPlanManagerAdapter = (
  manager: PlanManagerLike | null | undefined,
): PlanManagerAdapter | null => {
  if (!manager || (typeof manager !== 'object' && typeof manager !== 'function')) {
    return null;
  }

  const isMergingEnabledFn =
    typeof manager.isMergingEnabled === 'function'
      ? manager.isMergingEnabled.bind(manager)
      : null;
  const updateFn =
    typeof manager.update === 'function' ? manager.update.bind(manager) : null;
  const getFn = typeof manager.get === 'function' ? manager.get.bind(manager) : null;
  const resetFn = typeof manager.reset === 'function' ? manager.reset.bind(manager) : null;
  const syncFn = typeof manager.sync === 'function' ? manager.sync.bind(manager) : null;

  const ensurePlan = async (candidate: (() => unknown) | null): Promise<PlanStep[] | null> => {
    if (!candidate) {
      return null;
    }

    const value = await candidate();
    return toPlanArray(value);
  };

  const ensurePlanWithArg = async (
    candidate: ((plan: PlanStep[] | null | undefined) => unknown) | null,
    plan: PlanStep[] | null,
  ): Promise<PlanStep[] | null> => {
    if (!candidate) {
      return plan;
    }

    const value = await candidate(plan);
    return toPlanArray(value) ?? plan;
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
      if (incomingPlan) {
        // Let hosts merge/update the incoming plan even when the payload is empty. This keeps
        // the adapter aligned with the historic JS behavior where `update()` always fired.
        return ensurePlanWithArg(updateFn, incomingPlan);
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

      await syncFn(plan);
    },
  };
};
