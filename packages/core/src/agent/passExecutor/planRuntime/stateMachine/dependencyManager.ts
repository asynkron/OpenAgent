import { PlanDependencyManager } from '../../planDependencyManager.js';
import { globalRegistry } from '../../planStepRegistry.js';
import { extractPlanStepIdentifier } from '../../planStepIdentifier.js';
import { COMPLETED_STATUS, isCompletedStatus } from '../../planStepStatus.js';
import type { PlanStep } from '../../planExecution.js';
import type { PlanState } from './types.js';

export interface DependencyManagerContext {
  readonly state: PlanState;
  readonly markMutated: () => void;
}

export interface DependencyManagerHelpers {
  normalizeDependencies(): boolean;
  removeDependencyReferences(stepId: string): boolean;
  completePlanStep(planStep: PlanStep): boolean;
  pruneCompletedSteps(): { mutated: boolean; removedStepIds: string[] };
}

export const createDependencyManager = ({
  state,
  markMutated,
}: DependencyManagerContext): DependencyManagerHelpers => {
  const dependencyManager = new PlanDependencyManager();

  const normalizeDependencies = (): boolean => {
    if (dependencyManager.normalizeDependencies(state.activePlan)) {
      markMutated();
      return true;
    }

    return false;
  };

  const removeDependencyReferences = (stepId: string): boolean => {
    if (dependencyManager.removeDependencyReferences(state.activePlan, stepId)) {
      markMutated();
      return true;
    }

    return false;
  };

  const completePlanStep = (planStep: PlanStep): boolean => {
    const identifier = extractPlanStepIdentifier(planStep);

    planStep.status = COMPLETED_STATUS;
    markMutated();

    if (identifier) {
      globalRegistry.markCompleted(identifier);
      removeDependencyReferences(identifier);
      return true;
    }

    normalizeDependencies();
    return true;
  };

  const pruneCompletedSteps = (): { mutated: boolean; removedStepIds: string[] } => {
    if (state.activePlan.length === 0) {
      return { mutated: false, removedStepIds: [] };
    }

    const removedStepIds: string[] = [];

    const filteredPlan = state.activePlan.filter((candidate) => {
      if (!isCompletedStatus(candidate?.status)) {
        return true;
      }

      const identifier = extractPlanStepIdentifier(candidate);
      if (identifier) {
        removedStepIds.push(identifier);
        globalRegistry.markCompleted(identifier);
      }

      return false;
    });

    if (filteredPlan.length !== state.activePlan.length) {
      state.activePlan = filteredPlan;
      markMutated();
    }

    for (const identifier of removedStepIds) {
      removeDependencyReferences(identifier);
    }

    return { mutated: removedStepIds.length > 0, removedStepIds };
  };

  return {
    normalizeDependencies,
    removeDependencyReferences,
    completePlanStep,
    pruneCompletedSteps,
  } satisfies DependencyManagerHelpers;
};
