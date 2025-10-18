import type { PlanStep } from '../planExecution.js';
import type { PlanPersistenceCoordinator } from './persistenceCoordinator.js';
import type { PlanStateMachine } from './stateMachine/index.js';
import { createPlanSnapshotEffect, type InitializeResult } from './effects.js';
import { resolvePlanWithPersistence } from './persistenceEffects.js';

export interface PlanInitializationContext {
  readonly incomingPlan: PlanStep[] | null;
  readonly stateMachine: PlanStateMachine;
  readonly persistence: PlanPersistenceCoordinator;
}

export const initializePlanRuntime = async ({
  incomingPlan,
  stateMachine,
  persistence,
}: PlanInitializationContext): Promise<InitializeResult> => {
  const effects = [] as InitializeResult['effects'];

  const prepared = persistence.prepareIncomingPlan(incomingPlan);
  stateMachine.setInitialIncomingPlan(prepared.sanitizedPlan);

  const basePlan = Array.isArray(prepared.sanitizedPlan)
    ? prepared.sanitizedPlan
    : ([] as PlanStep[]);
  stateMachine.replaceActivePlan(basePlan);

  effects.push(
    ...(await resolvePlanWithPersistence({
      persistence,
      stateMachine,
      normalizedPlan: prepared.sanitizedPlan,
    })),
  );

  stateMachine.normalizeDependencies();
  stateMachine.pruneCompletedSteps();
  stateMachine.normalizeDependencies();

  effects.push(createPlanSnapshotEffect(stateMachine.cloneActivePlan()));
  stateMachine.resetMutationFlag();

  return {
    type: 'plan-initialized',
    effects,
  } satisfies InitializeResult;
};
