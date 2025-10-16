import {
  clonePlanForExecution,
  collectExecutablePlanSteps,
  type PlanStep,
  hasCommandPayload,
} from './planExecution.js';
import {
  createObservationHistoryEntry,
  createRefusalAutoResponseEntry,
  type ObservationRecord,
} from '../historyMessageBuilder.js';
import { refusalHeuristics } from './refusalDetection.js';
import type { PlanManagerAdapter } from './planManagerAdapter.js';
import type { PlanAutoResponseTracker } from './planReminderController.js';
import { createPlanReminderController } from './planReminderController.js';
import type { ChatMessageEntry } from '../historyEntry.js';
import type { CommandResult } from '../observationBuilder.js';
import type { ExecuteAgentPassOptions } from './types.js';
import { extractPlanStepIdentifier } from './planStepIdentifier.js';
import {
  COMPLETED_STATUS,
  RUNNING_STATUS,
  FAILED_STATUS,
  isCompletedStatus,
  hasPendingWork,
  normalizeAssistantMessage,
} from './planStepStatus.js';
import { summarizePlanForHistory, type PlanHistorySnapshot } from './planSnapshot.js';
import { PlanDependencyManager } from './planDependencyManager.js';
import { globalRegistry } from './planStepRegistry.js';
import { pickNextExecutableCandidate, type ExecutableCandidate } from './planExecutableSelector.js';

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

interface PlanState {
  activePlan: PlanStep[];
  initialIncomingPlan: PlanStep[] | null;
  planMutated: boolean;
}

export class PlanRuntime {
  private readonly state: PlanState = {
    activePlan: [],
    initialIncomingPlan: null,
    planMutated: false,
  };

  private readonly dependencyManager = new PlanDependencyManager();
  private readonly planReminder: ReturnType<typeof createPlanReminderController>;

  constructor(private readonly options: PlanRuntimeOptions) {
    this.planReminder = createPlanReminderController(options.planAutoResponseTracker);
  }

  private markMutated(): void {
    this.state.planMutated = true;
  }

  private normalizeDependencies(): void {
    if (this.dependencyManager.normalizeDependencies(this.state.activePlan)) {
      this.markMutated();
    }
  }

  private removeDependencyReferences(stepId: string): void {
    if (this.dependencyManager.removeDependencyReferences(this.state.activePlan, stepId)) {
      this.markMutated();
    }
  }

  private completePlanStep(planStep: PlanStep): void {
    const identifier = extractPlanStepIdentifier(planStep);

    planStep.status = COMPLETED_STATUS;
    this.markMutated();

    if (identifier) {
      globalRegistry.markCompleted(identifier);
      this.removeDependencyReferences(identifier);
      return;
    }

    this.normalizeDependencies();
  }

  private pruneCompletedSteps(): void {
    if (this.state.activePlan.length === 0) {
      return;
    }

    const removedStepIds: string[] = [];

    const filteredPlan = this.state.activePlan.filter((candidate) => {
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

    if (filteredPlan.length !== this.state.activePlan.length) {
      this.state.activePlan = filteredPlan;
      this.markMutated();
    }

    for (const identifier of removedStepIds) {
      this.removeDependencyReferences(identifier);
    }
  }

  async initialize(incomingPlan: PlanStep[] | null): Promise<void> {
    const normalizedIncoming = Array.isArray(incomingPlan) ? [...incomingPlan] : null;

    if (Array.isArray(normalizedIncoming) && normalizedIncoming.length === 0) {
      globalRegistry.clear();
    }

    const sanitizedIncoming = globalRegistry.filterCompletedSteps(normalizedIncoming);
    this.state.initialIncomingPlan = sanitizedIncoming;
    this.state.activePlan = Array.isArray(sanitizedIncoming) ? [...sanitizedIncoming] : [];

    if (this.options.planManager) {
      try {
        const resolved = await this.options.planManager.resolveActivePlan(normalizedIncoming);
        if (Array.isArray(resolved)) {
          const sanitizedResolved = globalRegistry.filterCompletedSteps(resolved);
          this.state.activePlan = Array.isArray(sanitizedResolved) ? [...sanitizedResolved] : [];
        }
      } catch (error) {
        this.options.emitEvent?.({
          type: 'status',
          level: 'warn',
          message: 'Failed to update persistent plan state.',
          details: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (!Array.isArray(this.state.activePlan)) {
      this.state.activePlan = [];
    }

    this.normalizeDependencies();
    this.pruneCompletedSteps();
    this.normalizeDependencies();

    this.emitPlanSnapshot();
    this.state.planMutated = false;
  }

  cloneActivePlan(): PlanStep[] {
    return clonePlanForExecution(this.state.activePlan);
  }

  emitPlanSnapshot(): void {
    this.options.emitEvent?.({ type: 'plan', plan: clonePlanForExecution(this.state.activePlan) });
  }

  buildPlanObservation(): ObservationRecord {
    return {
      observation_for_llm: {
        plan: summarizePlanForHistory(this.state.activePlan),
      },
      observation_metadata: {
        timestamp: new Date().toISOString(),
      },
    } satisfies ObservationRecord;
  }

  selectNextExecutableEntry(): ExecutableCandidate | null {
    this.normalizeDependencies();
    const candidates = collectExecutablePlanSteps(this.state.activePlan);
    return pickNextExecutableCandidate(candidates);
  }

  markCommandRunning(planStep: PlanStep | null): void {
    if (!planStep) {
      return;
    }
    planStep.status = RUNNING_STATUS;
    this.markMutated();
  }

  applyCommandObservation({
    planStep,
    observation,
    commandResult,
  }: {
    planStep: PlanStep | null;
    observation: Record<string, unknown>;
    commandResult: CommandResult;
  }): void {
    if (planStep) {
      planStep.observation = observation;
      this.markMutated();
    }

    const alternateExitCode = (() => {
      const candidate = (commandResult as Record<string, unknown>)?.exitCode;
      return typeof candidate === 'number' ? candidate : null;
    })();

    const exitCode =
      typeof commandResult?.exit_code === 'number' ? commandResult.exit_code : alternateExitCode;

    if (exitCode === 0 && planStep) {
      this.completePlanStep(planStep);
    } else if (exitCode !== null && planStep) {
      planStep.status = FAILED_STATUS;
      this.markMutated();
    }

    if (commandResult?.killed && planStep?.command) {
      delete planStep.command;
      this.markMutated();
    }
  }

  handleCommandRejection(planStep: PlanStep | null): void {
    this.options.emitEvent?.({
      type: 'status',
      level: 'warn',
      message: 'Command execution canceled by human request.',
    });

    const observation = {
      observation_for_llm: {
        canceled_by_human: true,
        message:
          'Human declined to execute the proposed command and asked the AI to propose an alternative approach without executing a command.',
      },
      observation_metadata: { timestamp: new Date().toISOString() },
    };

    if (planStep) {
      planStep.observation = observation;
      this.markMutated();
    }

    const planObservation = this.buildPlanObservation();
    this.options.history.push(
      createObservationHistoryEntry({ observation: planObservation, pass: this.options.passIndex }),
    );
  }

  resetPlanReminder(): void {
    this.planReminder.reset();
  }

  private async clearPersistentPlan(): Promise<void> {
    if (!this.options.planManager) {
      this.state.activePlan = [];
      globalRegistry.clear();
      this.emitPlanSnapshot();
      return;
    }

    try {
      const cleared = await this.options.planManager.resetPlanSnapshot();
      this.state.activePlan = Array.isArray(cleared) ? cleared : [];
      globalRegistry.clear();
    } catch (error) {
      this.options.emitEvent?.({
        type: 'status',
        level: 'warn',
        message: 'Failed to clear persistent plan state after completion.',
        details: error instanceof Error ? error.message : String(error),
      });
      this.state.activePlan = [];
      globalRegistry.clear();
    }

    this.emitPlanSnapshot();
  }

  async handleNoExecutable({
    parsedMessage,
  }: {
    parsedMessage: string;
  }): Promise<'continue' | 'stop'> {
    if (
      typeof this.options.getNoHumanFlag === 'function' &&
      typeof this.options.setNoHumanFlag === 'function' &&
      this.options.getNoHumanFlag()
    ) {
      const normalizedMessage = normalizeAssistantMessage(parsedMessage.trim().toLowerCase());
      if (normalizedMessage.replace(/[.!]+$/, '') === 'done') {
        this.options.setNoHumanFlag(false);
      }
    }

    const trimmedMessage = parsedMessage.trim();
    const normalizedMessage = normalizeAssistantMessage(trimmedMessage);
    const activePlanEmpty = this.state.activePlan.length === 0;
    const incomingPlanEmpty =
      !this.state.initialIncomingPlan || this.state.initialIncomingPlan.length === 0;

    if (
      activePlanEmpty &&
      incomingPlanEmpty &&
      refusalHeuristics.isLikelyRefusalMessage(normalizedMessage)
    ) {
      this.options.emitEvent?.({
        type: 'status',
        level: 'info',
        message: refusalHeuristics.statusMessage,
      });
      this.options.history.push(
        createRefusalAutoResponseEntry({
          autoResponseMessage: refusalHeuristics.autoResponse,
          pass: this.options.passIndex,
        }),
      );
      this.resetPlanReminder();
      return 'continue';
    }

    if (!activePlanEmpty) {
      const hasPendingSteps = this.state.activePlan.some(hasPendingWork);
      const hasPendingCommands = this.state.activePlan.some((candidate) =>
        hasCommandPayload(candidate?.command),
      );

      if (hasPendingSteps && hasPendingCommands) {
        this.emitPlanSnapshot();
        this.resetPlanReminder();
        return 'continue';
      }
    }

    if (activePlanEmpty) {
      await this.clearPersistentPlan();
    }

    this.resetPlanReminder();
    return 'stop';
  }

  async finalize(): Promise<void> {
    if (!this.state.planMutated) {
      return;
    }

    if (this.state.activePlan.length === 0) {
      await this.clearPersistentPlan();
    } else {
      this.emitPlanSnapshot();

      if (this.options.planManager) {
        try {
          await this.options.planManager.syncPlanSnapshot(this.state.activePlan);
        } catch (error) {
          this.options.emitEvent?.({
            type: 'status',
            level: 'warn',
            message: 'Failed to persist plan state after execution.',
            details: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    const planObservation = this.buildPlanObservation();
    this.options.history.push(
      createObservationHistoryEntry({ observation: planObservation, pass: this.options.passIndex }),
    );
  }
}
