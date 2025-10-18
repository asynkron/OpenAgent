import type { PlanStep } from '../planExecution.js';
import { createPlanSnapshotEffect, toEmitEffects, type PlanRuntimeEffect } from './effects.js';
import type { PlanPersistenceCoordinator } from './persistenceCoordinator.js';
import type { PlanStateMachine } from './stateMachine/index.js';

export interface PlanPersistenceContext {
  readonly persistence: PlanPersistenceCoordinator;
  readonly stateMachine: PlanStateMachine;
}

export interface ResolvePlanWithPersistenceContext extends PlanPersistenceContext {
  readonly normalizedPlan: PlanStep[] | null;
}

export const resolvePlanWithPersistence = async ({
  persistence,
  stateMachine,
  normalizedPlan,
}: ResolvePlanWithPersistenceContext): Promise<PlanRuntimeEffect[]> => {
  const { plan, warning } = await persistence.resolveActivePlan(normalizedPlan);
  const effects = toEmitEffects(warning);

  if (Array.isArray(plan)) {
    stateMachine.replaceActivePlan(plan);
  }

  return effects;
};

export const resetPlanStateFromPersistence = async ({
  persistence,
  stateMachine,
}: PlanPersistenceContext): Promise<PlanRuntimeEffect[]> => {
  const cleared = await persistence.resetPlanSnapshot();
  stateMachine.replaceActivePlan(cleared.plan);

  return [
    ...toEmitEffects(cleared.warning),
    createPlanSnapshotEffect(stateMachine.cloneActivePlan()),
  ];
};

export const persistPlanSnapshotWithEffects = async ({
  persistence,
  plan,
}: {
  readonly persistence: PlanPersistenceCoordinator;
  readonly plan: PlanStep[];
}): Promise<PlanRuntimeEffect[]> => {
  const warning = await persistence.persistPlanSnapshot(plan);
  return toEmitEffects(warning);
};

export const persistActivePlanSnapshot = async ({
  persistence,
  stateMachine,
}: PlanPersistenceContext): Promise<PlanRuntimeEffect[]> => {
  const planSnapshot = stateMachine.cloneActivePlan();
  return [
    createPlanSnapshotEffect(planSnapshot),
    ...(await persistPlanSnapshotWithEffects({
      persistence,
      plan: planSnapshot,
    })),
  ];
};

export const collectFinalizationEffects = async (
  context: PlanPersistenceContext,
): Promise<PlanRuntimeEffect[]> => {
  if (context.stateMachine.state.activePlan.length === 0) {
    return resetPlanStateFromPersistence(context);
  }

  return persistActivePlanSnapshot(context);
};
