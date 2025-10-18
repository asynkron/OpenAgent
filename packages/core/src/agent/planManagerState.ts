import type { PlanSnapshot } from '../utils/plan.js';
import type { PlanManagerStatusMessenger } from './planManagerStatus.js';

export interface PlanUpdateOptions {
  activePlan: PlanSnapshot;
  incomingPlan: PlanSnapshot;
  mergeEnabled: boolean;
  messenger: PlanManagerStatusMessenger;
  mergePlans(current: PlanSnapshot, incoming: PlanSnapshot): PlanSnapshot;
}

const EMPTY_PLAN_MESSAGE =
  'Cleared active plan after receiving an empty plan while merging is disabled.';
const REPLACED_PLAN_MESSAGE =
  'Replacing active plan with assistant update because plan merging is disabled.';
const INVALID_PLAN_WARNING =
  'Plan manager received an invalid plan snapshot. Ignoring payload.';

export const sanitizePlanSnapshot = (
  plan: unknown,
  clone: (plan: PlanSnapshot) => PlanSnapshot,
  messenger: PlanManagerStatusMessenger,
  warningMessage?: string,
): PlanSnapshot => {
  if (!Array.isArray(plan)) {
    const message = warningMessage ?? INVALID_PLAN_WARNING;
    messenger.warn(message);
    return [];
  }

  return clone(plan as PlanSnapshot);
};

export const applyPlanUpdate = ({
  activePlan,
  incomingPlan,
  mergeEnabled,
  messenger,
  mergePlans,
}: PlanUpdateOptions): PlanSnapshot => {
  if (incomingPlan.length === 0) {
    if (!mergeEnabled) {
      if (activePlan.length > 0) {
        messenger.info(EMPTY_PLAN_MESSAGE);
      }
      return [];
    }

    return activePlan;
  }

  if (mergeEnabled && activePlan.length > 0) {
    return mergePlans(activePlan, incomingPlan);
  }

  if (!mergeEnabled && activePlan.length > 0) {
    messenger.info(REPLACED_PLAN_MESSAGE);
  }

  return incomingPlan;
};

export const shouldPersistPlan = (plan: PlanSnapshot): boolean => plan.length > 0;
