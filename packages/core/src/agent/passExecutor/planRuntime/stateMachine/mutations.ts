import { clonePlanForExecution, type PlanStep } from '../../planExecution.js';
import { FAILED_STATUS, RUNNING_STATUS } from '../../planStepStatus.js';
import type { CommandResult } from '../../../observationBuilder.js';
import type { CommandObservationResult, PlanState } from './types.js';

export interface MutationContext {
  readonly state: PlanState;
  readonly markMutated: () => void;
  readonly completePlanStep: (planStep: PlanStep) => boolean;
}

export interface MutationHelpers {
  setInitialIncomingPlan(plan: PlanStep[] | null): void;
  replaceActivePlan(plan: PlanStep[]): void;
  clearActivePlan(): void;
  attachObservation(planStep: PlanStep | null, observation: Record<string, unknown>): boolean;
  markCommandRunning(planStep: PlanStep | null): boolean;
  applyCommandObservation(input: {
    planStep: PlanStep | null;
    observation: Record<string, unknown>;
    commandResult: CommandResult;
  }): CommandObservationResult;
}

const normalizePlanArray = (plan: PlanStep[] | null): PlanStep[] => clonePlanForExecution(plan);

export const createPlanMutations = ({
  state,
  markMutated,
  completePlanStep,
}: MutationContext): MutationHelpers => {
  return {
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
  } satisfies MutationHelpers;
};
