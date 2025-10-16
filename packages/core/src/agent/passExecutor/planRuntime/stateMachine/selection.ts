import { collectExecutablePlanSteps, hasCommandPayload } from '../../planExecution.js';
import { pickNextExecutableCandidate } from '../../planExecutableSelector.js';
import { hasPendingWork } from '../../planStepStatus.js';
import type { ExecutableCandidate } from '../../planExecutableSelector.js';
import type { PlanState } from './types.js';

export interface SelectionContext {
  readonly state: PlanState;
  readonly normalizeDependencies: () => boolean;
}

export interface SelectionHelpers {
  selectNextExecutable(): ExecutableCandidate | null;
  hasPendingExecutableWork(): boolean;
}

export const createPlanSelection = ({
  state,
  normalizeDependencies,
}: SelectionContext): SelectionHelpers => {
  return {
    selectNextExecutable() {
      normalizeDependencies();
      const candidates = collectExecutablePlanSteps(state.activePlan);
      return pickNextExecutableCandidate(candidates);
    },
    hasPendingExecutableWork() {
      if (state.activePlan.length === 0) {
        return false;
      }

      const hasPendingSteps = state.activePlan.some(hasPendingWork);
      const hasPendingCommands = state.activePlan.some((candidate) =>
        hasCommandPayload(candidate?.command),
      );

      return hasPendingSteps && hasPendingCommands;
    },
  } satisfies SelectionHelpers;
};
