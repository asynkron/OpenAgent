import type { PlanStep } from '../planExecution.js';
import type { PlanManagerAdapter } from '../planManagerAdapter.js';
import {
  prepareIncomingPlan,
  resolveActivePlan as resolveActivePlanWithManager,
  resetPersistedPlan as resetPersistedPlanWithManager,
  syncPlanSnapshot as syncPlanSnapshotWithManager,
  type PreparedIncomingPlan,
  type ResolvePlanResult,
  type ResetPlanResult,
  type StatusRuntimeEvent,
} from './persistence.js';

/**
 * Coordinates persistence hooks so the plan runtime can focus on state-machine updates.
 */
export interface PlanPersistenceCoordinator {
  prepareIncomingPlan(incomingPlan: PlanStep[] | null): PreparedIncomingPlan;
  resolveActivePlan(normalizedPlan: PlanStep[] | null): Promise<ResolvePlanResult>;
  resetPlanSnapshot(): Promise<ResetPlanResult>;
  persistPlanSnapshot(plan: PlanStep[]): Promise<StatusRuntimeEvent | null>;
}

export const createPlanPersistenceCoordinator = (
  planManager: PlanManagerAdapter | null,
): PlanPersistenceCoordinator => ({
  prepareIncomingPlan,
  resolveActivePlan: (normalizedPlan) =>
    resolveActivePlanWithManager(planManager, normalizedPlan),
  resetPlanSnapshot: () => resetPersistedPlanWithManager(planManager),
  persistPlanSnapshot: (plan) => syncPlanSnapshotWithManager(planManager, plan),
});
