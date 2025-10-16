import { clonePlanForExecution, collectExecutablePlanSteps, type PlanStep, hasCommandPayload } from '../planExecution.js';
import { PlanDependencyManager } from '../planDependencyManager.js';
import { globalRegistry } from '../planStepRegistry.js';
import { pickNextExecutableCandidate, type ExecutableCandidate } from '../planExecutableSelector.js';
import { extractPlanStepIdentifier } from '../planStepIdentifier.js';
import {
  COMPLETED_STATUS,
  RUNNING_STATUS,
  FAILED_STATUS,
  isCompletedStatus,
  hasPendingWork,
} from '../planStepStatus.js';
import type { CommandResult } from '../../observationBuilder.js';

export interface PlanState {
  activePlan: PlanStep[];
  initialIncomingPlan: PlanStep[] | null;
  planMutated: boolean;
}

export type CommandObservationResult =
  | { type: 'completed'; mutated: boolean }
  | { type: 'failed'; mutated: boolean }
  | { type: 'observation-recorded'; mutated: boolean }
  | { type: 'noop'; mutated: boolean };

export interface PlanStateMachine {
  readonly state: PlanState;
  setInitialIncomingPlan(plan: PlanStep[] | null): void;
  replaceActivePlan(plan: PlanStep[]): void;
  clearActivePlan(): void;
  attachObservation(planStep: PlanStep | null, observation: Record<string, unknown>): boolean;
  normalizeDependencies(): boolean;
  pruneCompletedSteps(): { mutated: boolean; removedStepIds: string[] };
  removeDependencyReferences(stepId: string): boolean;
  completePlanStep(planStep: PlanStep): boolean;
  markCommandRunning(planStep: PlanStep | null): boolean;
  applyCommandObservation(input: {
    planStep: PlanStep | null;
    observation: Record<string, unknown>;
    commandResult: CommandResult;
  }): CommandObservationResult;
  selectNextExecutable(): ExecutableCandidate | null;
  hasPendingExecutableWork(): boolean;
  cloneActivePlan(): PlanStep[];
  resetMutationFlag(): void;
}

const normalizePlanArray = (plan: PlanStep[] | null): PlanStep[] => clonePlanForExecution(plan);

export const createPlanStateMachine = (): PlanStateMachine => {
  const state: PlanState = {
    activePlan: [],
    initialIncomingPlan: null,
    planMutated: false,
  };

  const dependencyManager = new PlanDependencyManager();

  const markMutated = () => {
    state.planMutated = true;
  };

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

  const selectNextExecutable = (): ExecutableCandidate | null => {
    normalizeDependencies();
    const candidates = collectExecutablePlanSteps(state.activePlan);
    return pickNextExecutableCandidate(candidates);
  };

  return {
    state,
    setInitialIncomingPlan(plan) {
      state.initialIncomingPlan = Array.isArray(plan) ? normalizePlanArray(plan) : null;
    },
    replaceActivePlan(plan) {
      state.activePlan = normalizePlanArray(plan);
      markMutated();
    },
    clearActivePlan() {
      if (state.activePlan.length > 0) {
        state.activePlan = [];
        markMutated();
      }
    },
    attachObservation(planStep, observation) {
      if (!planStep) {
        return false;
      }

      planStep.observation = observation;
      markMutated();
      return true;
    },
    normalizeDependencies,
    pruneCompletedSteps,
    removeDependencyReferences,
    completePlanStep,
    markCommandRunning(planStep) {
      if (!planStep) {
        return false;
      }

      planStep.status = RUNNING_STATUS;
      markMutated();
      return true;
    },
    applyCommandObservation({ planStep, observation, commandResult }) {
      let mutated = false;

      if (planStep) {
        planStep.observation = observation;
        markMutated();
        mutated = true;
      }

      const alternateExitCode = (() => {
        const candidate = (commandResult as Record<string, unknown>)?.exitCode;
        return typeof candidate === 'number' ? candidate : null;
      })();

      const exitCode =
        typeof commandResult?.exit_code === 'number' ? commandResult.exit_code : alternateExitCode;

      if (exitCode === 0 && planStep) {
        completePlanStep(planStep);
        return { type: 'completed', mutated: true } satisfies CommandObservationResult;
      }

      if (exitCode !== null && planStep) {
        planStep.status = FAILED_STATUS;
        markMutated();
        mutated = true;
        return { type: 'failed', mutated: true } satisfies CommandObservationResult;
      }

      if (commandResult?.killed && planStep?.command) {
        delete planStep.command;
        markMutated();
        mutated = true;
      }

      if (mutated) {
        return { type: 'observation-recorded', mutated: true } satisfies CommandObservationResult;
      }

      return { type: 'noop', mutated: false } satisfies CommandObservationResult;
    },
    selectNextExecutable,
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
    cloneActivePlan() {
      return clonePlanForExecution(state.activePlan);
    },
    resetMutationFlag() {
      state.planMutated = false;
    },
  };
};
