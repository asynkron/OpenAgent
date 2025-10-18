import type { PlanPersistenceCoordinator } from './persistenceCoordinator.js';
import type { PlanStateMachine } from './stateMachine/index.js';
import {
  createPlanObservationEffect,
  createPlanSnapshotEffect,
  type FinalizeResult,
  toEmitEffects,
} from './effects.js';

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

  if (stateMachine.state.activePlan.length === 0) {
    const cleared = await persistence.resetPlanSnapshot();
    effects.push(...toEmitEffects(cleared.warning));
    stateMachine.replaceActivePlan(cleared.plan);
    effects.push(createPlanSnapshotEffect(stateMachine.cloneActivePlan()));
  } else {
    const planSnapshot = stateMachine.cloneActivePlan();
    effects.push(createPlanSnapshotEffect(planSnapshot));
    const warning = await persistence.persistPlanSnapshot(planSnapshot);
    effects.push(...toEmitEffects(warning));
  }

  effects.push(
    createPlanObservationEffect({
      activePlan: stateMachine.cloneActivePlan(),
      passIndex,
    }),
  );

  stateMachine.resetMutationFlag();

  return { type: 'completed', effects } satisfies FinalizeResult;
};
