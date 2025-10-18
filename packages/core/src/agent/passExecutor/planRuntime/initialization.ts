import type { PlanStep } from '../planExecution.js';
import type { PlanPersistenceCoordinator } from './persistenceCoordinator.js';
import type { PlanStateMachine } from './stateMachine/index.js';
import { createPlanSnapshotEffect, type InitializeResult, toEmitEffects } from './effects.js';

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

  const { plan: resolvedPlan, warning } = await persistence.resolveActivePlan(
    prepared.sanitizedPlan,
  );
  effects.push(...toEmitEffects(warning));

  if (Array.isArray(resolvedPlan)) {
    stateMachine.replaceActivePlan(resolvedPlan);
  }

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
