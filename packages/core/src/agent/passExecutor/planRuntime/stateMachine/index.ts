import { clonePlanForExecution } from '../../planExecution.js';
import { createDependencyManager } from './dependencyManager.js';
import { createPlanMutations } from './mutations.js';
import { createPlanSelection } from './selection.js';
import type { CommandObservationResult, PlanState, PlanStateMachine } from './types.js';

export type { CommandObservationResult, PlanState, PlanStateMachine } from './types.js';

export const createPlanStateMachine = (): PlanStateMachine => {
  const state: PlanState = {
    activePlan: [],
    initialIncomingPlan: null,
    planMutated: false,
  };

  const markMutated = () => {
    state.planMutated = true;
  };

  const dependencies = createDependencyManager({ state, markMutated });
  const mutations = createPlanMutations({
    state,
    markMutated,
    completePlanStep: dependencies.completePlanStep,
  });
  const selection = createPlanSelection({
    state,
    normalizeDependencies: dependencies.normalizeDependencies,
  });

  return {
    state,
    setInitialIncomingPlan: mutations.setInitialIncomingPlan,
    replaceActivePlan: mutations.replaceActivePlan,
    clearActivePlan: mutations.clearActivePlan,
    attachObservation: mutations.attachObservation,
    normalizeDependencies: dependencies.normalizeDependencies,
    pruneCompletedSteps: dependencies.pruneCompletedSteps,
    removeDependencyReferences: dependencies.removeDependencyReferences,
    completePlanStep: dependencies.completePlanStep,
    markCommandRunning: mutations.markCommandRunning,
    applyCommandObservation: mutations.applyCommandObservation,
    selectNextExecutable: selection.selectNextExecutable,
    hasPendingExecutableWork: selection.hasPendingExecutableWork,
    cloneActivePlan: () => clonePlanForExecution(state.activePlan),
    resetMutationFlag() {
      state.planMutated = false;
    },
  } satisfies PlanStateMachine;
};
