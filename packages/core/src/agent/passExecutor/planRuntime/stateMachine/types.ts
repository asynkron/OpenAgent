import type { PlanStep } from '../../planExecution.js';
import type { CommandResult } from '../../../../commands/run.js';
import type { ObservationRecord } from '../../../historyMessageBuilder.js';
import type { ExecutableCandidate } from '../../planExecutableSelector.js';

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
  attachObservation(planStep: PlanStep | null, observation: ObservationRecord): boolean;
  normalizeDependencies(): boolean;
  pruneCompletedSteps(): { mutated: boolean; removedStepIds: string[] };
  removeDependencyReferences(stepId: string): boolean;
  completePlanStep(planStep: PlanStep): boolean;
  markCommandRunning(planStep: PlanStep | null): boolean;
  applyCommandObservation(input: {
    planStep: PlanStep | null;
    observation: ObservationRecord;
    commandResult: CommandResult;
  }): CommandObservationResult;
  selectNextExecutable(): ExecutableCandidate | null;
  hasPendingExecutableWork(): boolean;
  cloneActivePlan(): PlanStep[];
  resetMutationFlag(): void;
}
