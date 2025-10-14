import {
  clonePlanForExecution,
  collectExecutablePlanSteps,
  getPriorityScore,
  type PlanStep,
  type ExecutablePlanStep,
  normalizeWaitingForIds,
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

export interface ExecutableCandidate extends ExecutablePlanStep {
  index: number;
  priority: number;
}

const COMPLETED_STATUS = 'completed';

// Track identifiers for steps we've already removed so future assistant
// responses cannot resurrect them. The set lives at module scope so it
// survives across `PlanRuntime` instances within the same agent session.
const completedPlanStepIds = new Set<string>();

const normalizePlanIdentifier = (value: unknown): string | null => {
  if (typeof value === 'string' || typeof value === 'number') {
    const normalized = String(value).trim();
    return normalized ? normalized : null;
  }

  return null;
};

const extractPlanStepIdentifier = (step: PlanStep | null | undefined): string | null => {
  if (!step || typeof step !== 'object') {
    return null;
  }

  const id = normalizePlanIdentifier(step.id);
  if (id) {
    return id;
  }

  const fallback = normalizePlanIdentifier((step as Record<string, unknown>).step);
  return fallback;
};

const arraysEqual = (left: string[], right: string[]): boolean => {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
};

const isCompletedStatus = (status: unknown): boolean =>
  typeof status === 'string' && status.trim().toLowerCase() === COMPLETED_STATUS;

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

  private normalizeActivePlanDependencies(): void {
    let mutated = false;

    this.activePlan.forEach((step) => {
      if (!step || typeof step !== 'object') {
        return;
      }

      const sanitized = normalizeWaitingForIds(step);
      const current = Array.isArray(step.waitingForId) ? step.waitingForId : [];
      let changed = current.length !== sanitized.length;

      if (!changed) {
        for (let index = 0; index < sanitized.length; index += 1) {
          if (normalizePlanIdentifier(current[index]) !== sanitized[index]) {
            changed = true;
            break;
          }
        }
      }

      if (changed) {
        step.waitingForId = sanitized;
        mutated = true;
      }
    });

    if (mutated) {
      this.planMutated = true;
    }
  }

  private removeDependencyReferences(stepId: string): void {
    let mutated = false;

    this.activePlan.forEach((step) => {
      if (!step || typeof step !== 'object') {
        return;
      }

      const sanitized = normalizeWaitingForIds(step);
      const filtered = sanitized.filter((value) => value !== stepId);
      if (!arraysEqual(filtered, sanitized)) {
        step.waitingForId = filtered;
        mutated = true;
        return;
      }

      const current = Array.isArray(step.waitingForId) ? step.waitingForId : [];
      let changed = current.length !== sanitized.length;
      if (!changed) {
        for (let index = 0; index < sanitized.length; index += 1) {
          if (normalizePlanIdentifier(current[index]) !== sanitized[index]) {
            changed = true;
            break;
          }
        }
      }

      if (changed) {
        step.waitingForId = sanitized;
        mutated = true;
      }
    });

    if (mutated) {
      this.planMutated = true;
    }
  }

  private completePlanStep(planStep: PlanStep): void {
    const identifier = extractPlanStepIdentifier(planStep);
    if (planStep && typeof planStep === 'object') {
      // Keep the step in the active plan so the assistant can see the completion
      // when we emit the observation; removal happens when the next response arrives.
      planStep.status = COMPLETED_STATUS;
      this.planMutated = true;
    }
    if (identifier) {
      completedPlanStepIds.add(identifier);
      this.removeDependencyReferences(identifier);
      return;
    }

    this.normalizeActivePlanDependencies();
  }

  private pruneCompletedSteps(): void {
    if (!Array.isArray(this.activePlan) || this.activePlan.length === 0) {
      return;
    }

    const removedStepIds: string[] = [];

    const filteredPlan = this.activePlan.filter((candidate) => {
      if (!isCompletedStatus(candidate?.status)) {
        return true;
      }

      const identifier = extractPlanStepIdentifier(candidate as PlanStep);
      if (identifier) {
        removedStepIds.push(identifier);
        completedPlanStepIds.add(identifier);
      }

      return false;
    });

    if (filteredPlan.length !== this.activePlan.length) {
      this.activePlan = filteredPlan;
      this.planMutated = true;
    }

    removedStepIds.forEach((identifier) => {
      this.removeDependencyReferences(identifier);
    });
  }

  private filterOutCompletedPlanSteps(plan: PlanStep[] | null): PlanStep[] | null {
    if (!Array.isArray(plan)) {
      return null;
    }

    if (plan.length === 0) {
      return [];
    }

    const filtered = plan.filter((candidate) => {
      const identifier = extractPlanStepIdentifier(candidate as PlanStep);
      if (!identifier) {
        return true;
      }

      return !completedPlanStepIds.has(identifier);
    });

    if (filtered.length === 0) {
      return [];
    }

    return filtered;
  }

  async initialize(incomingPlan: PlanStep[] | null): Promise<void> {
    const normalizedIncoming = Array.isArray(incomingPlan) ? [...incomingPlan] : null;
    if (Array.isArray(normalizedIncoming) && normalizedIncoming.length === 0) {
      // The assistant intentionally cleared the active plan. Allow identifiers to be reused
      // on the next response by resetting the registry of completed steps.
      completedPlanStepIds.clear();
    }
    const sanitizedIncoming = this.filterOutCompletedPlanSteps(normalizedIncoming);
    this.initialIncomingPlan = sanitizedIncoming;
    this.incomingPlan = Array.isArray(sanitizedIncoming) ? [...sanitizedIncoming] : [];
    this.activePlan = [...this.incomingPlan];

    if (this.options.planManager) {
      try {
        const resolved = await this.options.planManager.resolveActivePlan(normalizedIncoming);
        if (Array.isArray(resolved)) {
          const sanitizedResolved = this.filterOutCompletedPlanSteps(resolved);
          this.activePlan = Array.isArray(sanitizedResolved) ? [...sanitizedResolved] : [];
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

    this.normalizeActivePlanDependencies();
    this.pruneCompletedSteps();
    this.normalizeActivePlanDependencies();

    this.emitPlanSnapshot();
    this.planMutated = false;
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
    this.normalizeActivePlanDependencies();
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
      this.completePlanStep(planStep);
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
      completedPlanStepIds.clear();
      this.emitPlanSnapshot();
      return;
    }

    try {
      const cleared = await this.options.planManager.resetPlanSnapshot();
      this.activePlan = Array.isArray(cleared) ? cleared : [];
      completedPlanStepIds.clear();
    } catch (error) {
      this.options.emitEvent?.({
        type: 'status',
        level: 'warn',
        message: 'Failed to clear persistent plan state after completion.',
        details: error instanceof Error ? error.message : String(error),
      });
      this.activePlan = [];
      completedPlanStepIds.clear();
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

    if (activePlanEmpty) {
      await this.clearPersistentPlan();
      this.resetPlanReminder();
      return 'stop';
    }

    this.resetPlanReminder();
    return 'stop';
  }

  async finalize(): Promise<void> {
    if (!this.planMutated) {
      return;
    }

    if (this.activePlan.length === 0) {
      await this.clearPersistentPlan();
    } else {
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
    }

    const planObservation = this.buildPlanObservation();
    this.options.history.push(
      createObservationHistoryEntry({ observation: planObservation, pass: this.options.passIndex }),
    );
  }
}
