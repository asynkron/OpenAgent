import type { PlanPersistenceCoordinator } from './persistenceCoordinator.js';
import type { PlanStateMachine } from './stateMachine/index.js';
import { resetPlanStateFromPersistence } from './persistenceEffects.js';
import type { HandleNoExecutableResult } from './effects.js';

export interface PlanIdleStatus {
  readonly activePlanEmpty: boolean;
  readonly incomingPlanEmpty: boolean;
  readonly hasPendingExecutableWork: boolean;
}

export const evaluatePlanIdleStatus = (stateMachine: PlanStateMachine): PlanIdleStatus => {
  const { activePlan, initialIncomingPlan } = stateMachine.state;
  return {
    activePlanEmpty: activePlan.length === 0,
    incomingPlanEmpty: !initialIncomingPlan || initialIncomingPlan.length === 0,
    hasPendingExecutableWork: stateMachine.hasPendingExecutableWork(),
  } satisfies PlanIdleStatus;
};

export const restorePlanFromPersistenceIfEmpty = async ({
  planStatus,
  persistence,
  stateMachine,
  effects,
}: {
  readonly planStatus: PlanIdleStatus;
  readonly persistence: PlanPersistenceCoordinator;
  readonly stateMachine: PlanStateMachine;
  readonly effects: HandleNoExecutableResult['effects'];
}): Promise<void> => {
  if (!planStatus.activePlanEmpty) {
    return;
  }

  effects.push(
    ...(await resetPlanStateFromPersistence({
      persistence,
      stateMachine,
    })),
  );
  stateMachine.resetMutationFlag();
};
