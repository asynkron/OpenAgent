import type { PlanPersistenceCoordinator } from './persistenceCoordinator.js';
import type { PlanStateMachine } from './stateMachine/index.js';
import { createPlanObservationEffect, type FinalizeResult } from './effects.js';
import { collectFinalizationEffects } from './persistenceEffects.js';

export interface PlanFinalizationContext {
  readonly persistence: PlanPersistenceCoordinator;
  readonly stateMachine: PlanStateMachine;
  readonly passIndex: number;
}

export const finalizePlanRuntime = async ({
  persistence,
  stateMachine,
  passIndex,
}: PlanFinalizationContext): Promise<FinalizeResult> => {
  if (!stateMachine.state.planMutated) {
    return { type: 'noop', effects: [] } satisfies FinalizeResult;
  }

  const effects = [] as FinalizeResult['effects'];

  effects.push(
    ...(await collectFinalizationEffects({
      persistence,
      stateMachine,
    })),
  );

  effects.push(
    createPlanObservationEffect({
      activePlan: stateMachine.cloneActivePlan(),
      passIndex,
    }),
  );

  stateMachine.resetMutationFlag();

  return { type: 'completed', effects } satisfies FinalizeResult;
};
