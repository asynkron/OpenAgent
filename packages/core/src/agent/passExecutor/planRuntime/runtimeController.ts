import type { PlanStep } from '../planExecution.js';
import type { ExecuteAgentPassOptions } from '../types.js';
import type { ChatMessageEntry } from '../../historyEntry.js';
import type { CommandResult } from '../../../commands/run.js';
import type { ObservationRecord } from '../../historyMessageBuilder.js';
import { createPlanStateMachine, type PlanStateMachine } from './stateMachine/index.js';
import {
  createRuntimeReminderController,
  type RuntimeReminderController,
} from './reminderController.js';
import { initializePlanRuntime } from './initialization.js';
import { finalizePlanRuntime } from './finalization.js';
import {
  handleCommandRejection as handleCommandRejectionIdle,
  handleNoExecutableMessage,
} from './idleHandlers.js';
import {
  applyPlanRuntimeEffects,
  createPlanSnapshotEffect,
  createResetReminderEffect,
  type CommandRejectionResult,
  type FinalizeResult,
  type HandleNoExecutableResult,
  type InitializeResult,
  type PlanRuntimeEffect,
} from './effects.js';
import { buildPlanObservation as buildPlanObservationRecord } from './observationRecorder.js';
import type { PlanManagerAdapter } from '../planManagerAdapter.js';
import type { PlanAutoResponseTracker } from '../planReminderController.js';
import { summarizePlanForHistory, type PlanHistorySnapshot } from '../planSnapshot.js';
import type { ExecutableCandidate } from '../planExecutableSelector.js';
import {
  createPlanPersistenceCoordinator,
  type PlanPersistenceCoordinator,
} from './persistenceCoordinator.js';

export type {
  PlanRuntimeEffect,
  InitializeResult,
  HandleNoExecutableResult,
  FinalizeResult,
  CommandRejectionResult,
} from './effects.js';
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
  readonly planPersistence?: PlanPersistenceCoordinator;
}

export class PlanRuntime {
  private readonly stateMachine: PlanStateMachine;
  private readonly reminder: RuntimeReminderController;
  private readonly persistence: PlanPersistenceCoordinator;
  private readonly history: ChatMessageEntry[];
  private readonly emitEvent: ExecuteAgentPassOptions['emitEvent'];
  private readonly passIndex: number;
  private readonly getNoHumanFlag?: ExecuteAgentPassOptions['getNoHumanFlag'];
  private readonly setNoHumanFlag?: ExecuteAgentPassOptions['setNoHumanFlag'];

  constructor(options: PlanRuntimeOptions) {
    this.history = options.history;
    this.emitEvent = options.emitEvent;
    this.passIndex = options.passIndex;
    this.getNoHumanFlag = options.getNoHumanFlag;
    this.setNoHumanFlag = options.setNoHumanFlag;
    this.stateMachine = createPlanStateMachine();
    this.reminder = createRuntimeReminderController(options.planAutoResponseTracker);
    this.persistence =
      options.planPersistence ?? createPlanPersistenceCoordinator(options.planManager);
  }

  applyEffects(effects: PlanRuntimeEffect[]): void {
    applyPlanRuntimeEffects(effects, {
      history: this.history,
      emitEvent: this.emitEvent,
      setNoHumanFlag: this.setNoHumanFlag,
      reminder: this.reminder,
    });
  }

  async initialize(incomingPlan: PlanStep[] | null): Promise<InitializeResult> {
    return initializePlanRuntime({
      incomingPlan,
      stateMachine: this.stateMachine,
      persistence: this.persistence,
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
      passIndex: this.passIndex,
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
      persistence: this.persistence,
      passIndex: this.passIndex,
      getNoHumanFlag: this.getNoHumanFlag,
      setNoHumanFlag: this.setNoHumanFlag,
    });
  }

  async finalize(): Promise<FinalizeResult> {
    return finalizePlanRuntime({
      persistence: this.persistence,
      stateMachine: this.stateMachine,
      passIndex: this.passIndex,
    });
  }
}
