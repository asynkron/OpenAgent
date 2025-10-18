import { maybeCreateRefusalEffects } from './refusalEffects.js';
import {
  createPlanSnapshotEffect,
  createResetReminderEffect,
  type HandleNoExecutableResult,
} from './effects.js';
import type { PlanStateMachine } from './stateMachine/index.js';
import type { MessageAnalysis } from './noExecutableMessage.js';
import type { PlanIdleStatus } from './planIdleStatus.js';

export const resolveRefusal = ({
  analysis,
  passIndex,
  planStatus,
  effects,
}: {
  readonly analysis: MessageAnalysis;
  readonly passIndex: number;
  readonly planStatus: PlanIdleStatus;
  readonly effects: HandleNoExecutableResult['effects'];
}): HandleNoExecutableResult | null => {
  const refusalEffects = maybeCreateRefusalEffects({
    normalizedMessage: analysis.normalized,
    passIndex,
    activePlanEmpty: planStatus.activePlanEmpty,
    incomingPlanEmpty: planStatus.incomingPlanEmpty,
  });

  if (!refusalEffects) {
    return null;
  }

  effects.push(...refusalEffects);
  return { type: 'continue-refusal', effects } satisfies HandleNoExecutableResult;
};

export const resolvePendingWork = ({
  planStatus,
  stateMachine,
  effects,
}: {
  readonly planStatus: PlanIdleStatus;
  readonly stateMachine: PlanStateMachine;
  readonly effects: HandleNoExecutableResult['effects'];
}): HandleNoExecutableResult | null => {
  if (planStatus.activePlanEmpty || !planStatus.hasPendingExecutableWork) {
    return null;
  }

  effects.push(createPlanSnapshotEffect(stateMachine.cloneActivePlan()));
  effects.push(createResetReminderEffect());
  return { type: 'continue-pending', effects } satisfies HandleNoExecutableResult;
};
