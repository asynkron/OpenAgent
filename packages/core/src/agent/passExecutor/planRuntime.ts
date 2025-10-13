import { planHasOpenSteps } from '../../utils/plan.js';
import {
  clonePlanForExecution,
  collectExecutablePlanSteps,
  ensurePlanStepAge,
  getPriorityScore,
  incrementRunningPlanStepAges,
  type PlanStep,
  type ExecutablePlanStep,
} from './planExecution.js';
import {
  createObservationHistoryEntry,
  createPlanReminderEntry,
  createRefusalAutoResponseEntry,
  type ObservationRecord,
} from '../historyMessageBuilder.js';
import { refusalHeuristics } from './refusalDetection.js';
import type { PlanManagerAdapter } from './planManagerAdapter.js';
import type { PlanAutoResponseTracker } from './planReminderController.js';
import {
  PLAN_REMINDER_AUTO_RESPONSE_LIMIT,
  createPlanReminderController,
} from './planReminderController.js';
import type { ChatMessageEntry } from '../historyEntry.js';
import type { CommandResult } from '../observationBuilder.js';
import type { ExecuteAgentPassOptions } from './types.js';

export interface ExecutableCandidate extends ExecutablePlanStep {
  index: number;
  priority: number;
}

const pickNextExecutableCandidate = (entries: ExecutablePlanStep[]): ExecutableCandidate | null => {
  let best: ExecutableCandidate | null = null;

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const candidate: ExecutableCandidate = {
      ...entry,
      index,
      priority: getPriorityScore(entry.step),
    };

    if (!best) {
      best = candidate;
      continue;
    }

    if (candidate.priority < best.priority) {
      best = candidate;
      continue;
    }

    if (candidate.priority === best.priority && candidate.index < best.index) {
      best = candidate;
    }
  }

  return best;
};

const normalizeAssistantMessage = (value: unknown): string =>
  typeof value === 'string' ? value.replace(/[\u2018\u2019]/g, "'") : '';

export interface PlanRuntimeOptions {
  history: ChatMessageEntry[];
  passIndex: number;
  emitEvent: ExecuteAgentPassOptions['emitEvent'];
  planReminderMessage: string;
  planManager: PlanManagerAdapter | null;
  planAutoResponseTracker: PlanAutoResponseTracker | null;
  getNoHumanFlag?: ExecuteAgentPassOptions['getNoHumanFlag'];
  setNoHumanFlag?: ExecuteAgentPassOptions['setNoHumanFlag'];
}

export class PlanRuntime {
  private activePlan: PlanStep[] = [];
  private incomingPlan: PlanStep[] | null = null;
  private readonly planReminder: ReturnType<typeof createPlanReminderController>;
  private planMutated = false;
  private initialIncomingPlan: PlanStep[] | null = null;

  constructor(private readonly options: PlanRuntimeOptions) {
    this.planReminder = createPlanReminderController(options.planAutoResponseTracker);
  }

  async initialize(incomingPlan: PlanStep[] | null): Promise<void> {
    const normalizedIncoming = Array.isArray(incomingPlan) ? [...incomingPlan] : null;
    this.initialIncomingPlan = normalizedIncoming;
    this.incomingPlan = normalizedIncoming ? [...normalizedIncoming] : [];
    this.activePlan = [...this.incomingPlan];

    if (this.options.planManager) {
      try {
        const resolved = await this.options.planManager.resolveActivePlan(normalizedIncoming);
        if (Array.isArray(resolved)) {
          this.activePlan = resolved;
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

    if (!Array.isArray(this.activePlan)) {
      this.activePlan = [];
    }

    ensurePlanStepAge(this.activePlan);
    incrementRunningPlanStepAges(this.activePlan);
    this.emitPlanSnapshot();
  }

  cloneActivePlan(): PlanStep[] {
    return clonePlanForExecution(this.activePlan);
  }

  emitPlanSnapshot(): void {
    this.options.emitEvent?.({ type: 'plan', plan: clonePlanForExecution(this.activePlan) });
  }

  buildPlanObservation(): ObservationRecord {
    return {
      observation_for_llm: {
        plan: this.cloneActivePlan(),
      },
      observation_metadata: {
        timestamp: new Date().toISOString(),
      },
    } satisfies ObservationRecord;
  }

  selectNextExecutableEntry(): ExecutableCandidate | null {
    return pickNextExecutableCandidate(collectExecutablePlanSteps(this.activePlan));
  }

  markCommandRunning(planStep: PlanStep | null): void {
    if (!planStep) {
      return;
    }
    planStep.status = 'running';
    this.planMutated = true;
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
      this.planMutated = true;
    }

    const alternateExitCode = (() => {
      const candidate = (commandResult as Record<string, unknown>)?.exitCode;
      return typeof candidate === 'number' ? candidate : null;
    })();

    const exitCode =
      typeof commandResult?.exit_code === 'number' ? commandResult.exit_code : alternateExitCode;

    if (exitCode === 0 && planStep) {
      planStep.status = 'completed';
      this.planMutated = true;
    } else if (exitCode !== null && planStep) {
      planStep.status = 'failed';
      this.planMutated = true;
    }

    if (commandResult?.killed && planStep?.command) {
      delete planStep.command;
      this.planMutated = true;
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
      this.planMutated = true;
    }

    const planObservation = this.buildPlanObservation();
    this.options.history.push(
      createObservationHistoryEntry({ observation: planObservation, pass: this.options.passIndex }),
    );
  }

  private getPlanReminder() {
    return this.planReminder;
  }

  resetPlanReminder(): void {
    this.getPlanReminder().reset();
  }

  private async clearPersistentPlan(): Promise<void> {
    if (!this.options.planManager) {
      this.activePlan = [];
      this.emitPlanSnapshot();
      return;
    }

    try {
      const cleared = await this.options.planManager.resetPlanSnapshot();
      this.activePlan = Array.isArray(cleared) ? cleared : [];
    } catch (error) {
      this.options.emitEvent?.({
        type: 'status',
        level: 'warn',
        message: 'Failed to clear persistent plan state after completion.',
        details: error instanceof Error ? error.message : String(error),
      });
      this.activePlan = [];
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
    const activePlanEmpty = this.activePlan.length === 0;
    const incomingPlanEmpty = !this.initialIncomingPlan || this.initialIncomingPlan.length === 0;

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

    const hasOpenSteps = this.activePlan.length > 0 && planHasOpenSteps(this.activePlan);

    if (hasOpenSteps) {
      const attempt = this.getPlanReminder().recordAttempt();

      if (attempt <= PLAN_REMINDER_AUTO_RESPONSE_LIMIT) {
        this.options.emitEvent?.({
          type: 'status',
          level: 'warn',
          message: this.options.planReminderMessage,
        });
        this.options.history.push(
          createPlanReminderEntry({
            planReminderMessage: this.options.planReminderMessage,
            pass: this.options.passIndex,
          }),
        );
        return 'continue';
      }

      return 'stop';
    }

    if (!activePlanEmpty && !hasOpenSteps) {
      await this.clearPersistentPlan();
    }

    this.resetPlanReminder();
    return 'stop';
  }

  async finalize(): Promise<void> {
    if (!this.planMutated) {
      return;
    }

    this.emitPlanSnapshot();

    if (this.options.planManager) {
      try {
        await this.options.planManager.syncPlanSnapshot(this.activePlan);
      } catch (error) {
        this.options.emitEvent?.({
          type: 'status',
          level: 'warn',
          message: 'Failed to persist plan state after execution.',
          details: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const planObservation = this.buildPlanObservation();
    this.options.history.push(
      createObservationHistoryEntry({ observation: planObservation, pass: this.options.passIndex }),
    );
  }
}
