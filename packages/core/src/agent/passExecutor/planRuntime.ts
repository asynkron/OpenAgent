import type { PlanStep } from './planExecution.js';
import type { ExecuteAgentPassOptions } from './types.js';
import type { ChatMessageEntry } from '../historyEntry.js';
import type { CommandResult } from '../../commands/run.js';
import type { ObservationRecord } from '../historyMessageBuilder.js';
import { createPlanStateMachine, type PlanStateMachine } from './planRuntime/stateMachine/index.js';
import {
  createRuntimeReminderController,
  type RuntimeReminderController,
} from './planRuntime/reminderController.js';
import { initializePlanRuntime } from './planRuntime/initialization.js';
import { finalizePlanRuntime } from './planRuntime/finalization.js';
import {
  handleCommandRejection as handleCommandRejectionIdle,
  handleNoExecutableMessage,
} from './planRuntime/idleHandlers.js';
import {
  applyPlanRuntimeEffects,
  createPlanSnapshotEffect,
  createResetReminderEffect,
  type CommandRejectionResult,
  type FinalizeResult,
  type HandleNoExecutableResult,
  type InitializeResult,
  type PlanRuntimeEffect,
} from './planRuntime/effects.js';
import { buildPlanObservation as buildPlanObservationRecord } from './planRuntime/observationRecorder.js';
import type { PlanManagerAdapter } from './planManagerAdapter.js';
import type { PlanAutoResponseTracker } from './planReminderController.js';
import { summarizePlanForHistory, type PlanHistorySnapshot } from './planSnapshot.js';
import type { ExecutableCandidate } from './planExecutableSelector.js';

export type {
  PlanRuntimeEffect,
  InitializeResult,
  HandleNoExecutableResult,
  FinalizeResult,
  CommandRejectionResult,
} from './planRuntime/effects.js';
export type { ExecutableCandidate, PlanHistorySnapshot };
export { summarizePlanForHistory };

export interface PlanRuntimeOptions {
  readonly history: ChatMessageEntry[];
  readonly passIndex: number;
  readonly emitEvent: ExecuteAgentPassOptions['emitEvent'];
  readonly planReminderMessage: string;
  readonly planManager: PlanManagerAdapter | null;
  readonly planAutoResponseTracker: PlanAutoResponseTracker | null;
  readonly getNoHumanFlag?: ExecuteAgentPassOptions['getNoHumanFlag'];
  readonly setNoHumanFlag?: ExecuteAgentPassOptions['setNoHumanFlag'];
}

export class PlanRuntime {
  private readonly stateMachine: PlanStateMachine;
  private readonly reminder: RuntimeReminderController;

  constructor(private readonly options: PlanRuntimeOptions) {
    this.stateMachine = createPlanStateMachine();
    this.reminder = createRuntimeReminderController(options.planAutoResponseTracker);
  }

  applyEffects(effects: PlanRuntimeEffect[]): void {
    applyPlanRuntimeEffects(effects, {
      history: this.options.history,
      emitEvent: this.options.emitEvent,
      setNoHumanFlag: this.options.setNoHumanFlag,
      reminder: this.reminder,
    });
  }

  async initialize(incomingPlan: PlanStep[] | null): Promise<InitializeResult> {
    return initializePlanRuntime({
      incomingPlan,
      stateMachine: this.stateMachine,
      planManager: this.options.planManager,
    });
  }

  selectNextExecutableEntry(): ExecutableCandidate | null {
    return this.stateMachine.selectNextExecutable();
  }

  markCommandRunning(planStep: PlanStep | null): void {
    this.stateMachine.markCommandRunning(planStep);
  }

  applyCommandObservation({
    planStep,
    observation,
    commandResult,
  }: {
    planStep: PlanStep | null;
    observation: ObservationRecord;
    commandResult: CommandResult;
  }): void {
    this.stateMachine.applyCommandObservation({ planStep, observation, commandResult });
  }

  emitPlanSnapshot(): PlanRuntimeEffect {
    return createPlanSnapshotEffect(this.stateMachine.cloneActivePlan());
  }

  buildPlanObservation(): ObservationRecord {
    return buildPlanObservationRecord(this.stateMachine.cloneActivePlan());
  }

  resetPlanReminder(): void {
    this.applyEffects([createResetReminderEffect()]);
  }

  handleCommandRejection(planStep: PlanStep | null): CommandRejectionResult {
    return handleCommandRejectionIdle({
      planStep,
      stateMachine: this.stateMachine,
      passIndex: this.options.passIndex,
    });
  }

  async handleNoExecutable({
    parsedMessage,
  }: {
    parsedMessage: string;
  }): Promise<HandleNoExecutableResult> {
    return handleNoExecutableMessage({
      parsedMessage,
      stateMachine: this.stateMachine,
      planManager: this.options.planManager,
      passIndex: this.options.passIndex,
      getNoHumanFlag: this.options.getNoHumanFlag,
      setNoHumanFlag: this.options.setNoHumanFlag,
    });
  }

  async finalize(): Promise<FinalizeResult> {
    return finalizePlanRuntime({
      planManager: this.options.planManager,
      stateMachine: this.stateMachine,
      passIndex: this.options.passIndex,
    });
  }
}
