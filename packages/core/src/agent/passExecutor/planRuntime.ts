import type { PlanStep } from './planExecution.js';
import type { ExecuteAgentPassOptions } from './types.js';
import type { ChatMessageEntry } from '../historyEntry.js';
import type { CommandResult } from '../observationBuilder.js';
import {
  createPlanStateMachine,
  type PlanStateMachine,
} from './planRuntime/stateMachine.js';
import {
  prepareIncomingPlan,
  resolveActivePlan,
  resetPersistedPlan,
  syncPlanSnapshot,
  type RuntimeStatusEvent,
} from './planRuntime/persistence.js';
import {
  buildPlanObservation as buildPlanObservationRecord,
  createPlanObservationHistoryEntry,
  createCommandRejectionObservation,
} from './planRuntime/observationRecorder.js';
import { createRuntimeReminderController } from './planRuntime/reminderController.js';
import { refusalHeuristics } from './refusalDetection.js';
import { createRefusalAutoResponseEntry, type ObservationRecord } from '../historyMessageBuilder.js';
import type { PlanManagerAdapter } from './planManagerAdapter.js';
import type { PlanAutoResponseTracker } from './planReminderController.js';
import { summarizePlanForHistory, type PlanHistorySnapshot } from './planSnapshot.js';
import { clonePlanForExecution } from './planExecution.js';
import type { ExecutableCandidate } from './planExecutableSelector.js';
import { normalizeAssistantMessage } from './planStepStatus.js';

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

type RuntimeEvent = Parameters<NonNullable<ExecuteAgentPassOptions['emitEvent']>>[0];

export type PlanRuntimeEffect =
  | { type: 'emit'; event: RuntimeEvent }
  | { type: 'plan-snapshot'; plan: PlanStep[] }
  | { type: 'history-entry'; entry: ChatMessageEntry }
  | { type: 'set-no-human-flag'; value: boolean };

interface PlanRuntimeResult<T extends string> {
  readonly type: T;
  readonly effects: PlanRuntimeEffect[];
}

export type InitializeResult = PlanRuntimeResult<'plan-initialized'>;
export type HandleNoExecutableResult =
  | PlanRuntimeResult<'continue-refusal'>
  | PlanRuntimeResult<'continue-pending'>
  | PlanRuntimeResult<'stop-cleared'>;
export type FinalizeResult = PlanRuntimeResult<'noop'> | PlanRuntimeResult<'completed'>;
export type CommandRejectionResult = PlanRuntimeResult<'command-rejected'>;

const toEmitEffect = (event: RuntimeEvent | RuntimeStatusEvent | null): PlanRuntimeEffect[] => {
  if (!event) {
    return [];
  }

  return [{ type: 'emit', event: event as RuntimeEvent }];
};

export class PlanRuntime {
  private readonly stateMachine: PlanStateMachine;
  private readonly reminder;

  constructor(private readonly options: PlanRuntimeOptions) {
    this.stateMachine = createPlanStateMachine();
    this.reminder = createRuntimeReminderController(options.planAutoResponseTracker);
  }

  applyEffects(effects: PlanRuntimeEffect[]): void {
    for (const effect of effects) {
      switch (effect.type) {
        case 'emit':
          this.options.emitEvent?.(effect.event);
          break;
        case 'plan-snapshot':
          this.options.emitEvent?.({ type: 'plan', plan: clonePlanForExecution(effect.plan) });
          break;
        case 'history-entry':
          this.options.history.push(effect.entry);
          break;
        case 'set-no-human-flag':
          this.options.setNoHumanFlag?.(effect.value);
          break;
      }
    }
  }

  private createPlanSnapshotEffect(plan?: PlanStep[]): PlanRuntimeEffect {
    const snapshot = plan ?? this.stateMachine.cloneActivePlan();
    return { type: 'plan-snapshot', plan: snapshot };
  }

  private createPlanObservationEntry(): ChatMessageEntry {
    return createPlanObservationHistoryEntry({
      activePlan: this.stateMachine.cloneActivePlan(),
      passIndex: this.options.passIndex,
    });
  }

  private recordPlanObservation(): PlanRuntimeEffect {
    return { type: 'history-entry', entry: this.createPlanObservationEntry() };
  }

  private attachObservation(planStep: PlanStep | null, observation: ObservationRecord): void {
    this.stateMachine.attachObservation(planStep, observation);
  }

  async initialize(incomingPlan: PlanStep[] | null): Promise<InitializeResult> {
    const effects: PlanRuntimeEffect[] = [];
    const prepared = prepareIncomingPlan(incomingPlan);

    this.stateMachine.setInitialIncomingPlan(prepared.sanitizedPlan);

    const basePlan = Array.isArray(prepared.sanitizedPlan)
      ? prepared.sanitizedPlan
      : ([] as PlanStep[]);

    this.stateMachine.replaceActivePlan(basePlan);

    const { plan: resolvedPlan, warning } = await resolveActivePlan(
      this.options.planManager,
      prepared.sanitizedPlan,
    );

    effects.push(...toEmitEffect(warning));

    if (Array.isArray(resolvedPlan)) {
      this.stateMachine.replaceActivePlan(resolvedPlan);
    }

    this.stateMachine.normalizeDependencies();
    this.stateMachine.pruneCompletedSteps();
    this.stateMachine.normalizeDependencies();

    const snapshotEffect = this.createPlanSnapshotEffect();
    this.stateMachine.resetMutationFlag();

    return {
      type: 'plan-initialized',
      effects: [...effects, snapshotEffect],
    } satisfies InitializeResult;
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
    observation: Record<string, unknown>;
    commandResult: CommandResult;
  }): void {
    this.stateMachine.applyCommandObservation({ planStep, observation, commandResult });
  }

  emitPlanSnapshot(): PlanRuntimeEffect {
    return this.createPlanSnapshotEffect();
  }

  buildPlanObservation(): ObservationRecord {
    return buildPlanObservationRecord(this.stateMachine.cloneActivePlan());
  }

  private resetReminder(): void {
    this.reminder.reset();
  }

  resetPlanReminder(): void {
    this.resetReminder();
  }

  handleCommandRejection(planStep: PlanStep | null): CommandRejectionResult {
    const effects: PlanRuntimeEffect[] = [
      {
        type: 'emit',
        event: {
          type: 'status',
          level: 'warn',
          message: 'Command execution canceled by human request.',
        } as RuntimeEvent,
      },
    ];

    const observation = createCommandRejectionObservation();
    this.attachObservation(planStep, observation);

    effects.push(this.recordPlanObservation());

    return {
      type: 'command-rejected',
      effects,
    } satisfies CommandRejectionResult;
  }

  async handleNoExecutable({
    parsedMessage,
  }: {
    parsedMessage: string;
  }): Promise<HandleNoExecutableResult> {
    const effects: PlanRuntimeEffect[] = [];

    if (
      typeof this.options.getNoHumanFlag === 'function' &&
      typeof this.options.setNoHumanFlag === 'function' &&
      this.options.getNoHumanFlag()
    ) {
      const normalizedMessage = normalizeAssistantMessage(parsedMessage.trim().toLowerCase());
      if (normalizedMessage.replace(/[.!]+$/, '') === 'done') {
        effects.push({ type: 'set-no-human-flag', value: false });
      }
    }

    const trimmedMessage = parsedMessage.trim();
    const normalizedMessage = normalizeAssistantMessage(trimmedMessage);
    const activePlanEmpty = this.stateMachine.state.activePlan.length === 0;
    const incomingPlanEmpty =
      !this.stateMachine.state.initialIncomingPlan ||
      this.stateMachine.state.initialIncomingPlan.length === 0;

    if (
      activePlanEmpty &&
      incomingPlanEmpty &&
      refusalHeuristics.isLikelyRefusalMessage(normalizedMessage)
    ) {
      effects.push(
        ...toEmitEffect({
          type: 'status',
          level: 'info',
          message: refusalHeuristics.statusMessage,
        }),
      );

      effects.push({
        type: 'history-entry',
        entry: createRefusalAutoResponseEntry({
          autoResponseMessage: refusalHeuristics.autoResponse,
          pass: this.options.passIndex,
        }),
      });

      this.resetReminder();
      return { type: 'continue-refusal', effects };
    }

    if (!activePlanEmpty && this.stateMachine.hasPendingExecutableWork()) {
      effects.push(this.createPlanSnapshotEffect());
      this.resetReminder();
      return { type: 'continue-pending', effects };
    }

    if (activePlanEmpty) {
      const cleared = await resetPersistedPlan(this.options.planManager);
      effects.push(...toEmitEffect(cleared.warning));
      this.stateMachine.replaceActivePlan(cleared.plan);
      effects.push(this.createPlanSnapshotEffect());
      this.stateMachine.resetMutationFlag();
    }

    this.resetReminder();
    return { type: 'stop-cleared', effects };
  }

  async finalize(): Promise<FinalizeResult> {
    if (!this.stateMachine.state.planMutated) {
      return { type: 'noop', effects: [] } satisfies FinalizeResult;
    }

    const effects: PlanRuntimeEffect[] = [];

    if (this.stateMachine.state.activePlan.length === 0) {
      const cleared = await resetPersistedPlan(this.options.planManager);
      effects.push(...toEmitEffect(cleared.warning));
      this.stateMachine.replaceActivePlan(cleared.plan);
      effects.push(this.createPlanSnapshotEffect());
    } else {
      const planSnapshot = this.stateMachine.cloneActivePlan();
      const snapshotEffect = this.createPlanSnapshotEffect(planSnapshot);
      effects.push(snapshotEffect);
      const warning = await syncPlanSnapshot(this.options.planManager, planSnapshot);
      effects.push(...toEmitEffect(warning));
    }

    effects.push(this.recordPlanObservation());
    this.stateMachine.resetMutationFlag();

    return { type: 'completed', effects } satisfies FinalizeResult;
  }
}
