import type { ExecuteAgentPassOptions } from '../types.js';
import type { ChatMessageEntry } from '../../historyEntry.js';
import type { PlanStep } from '../planExecution.js';
import { clonePlanForExecution } from '../planExecution.js';
import type { RuntimeReminderController } from './reminderController.js';
import { createPlanObservationHistoryEntry } from './observationRecorder.js';
import type { RuntimeStatusEvent } from './persistence.js';

export type RuntimeEvent = Parameters<NonNullable<ExecuteAgentPassOptions['emitEvent']>>[0];

export type PlanRuntimeEffect =
  | { type: 'emit'; event: RuntimeEvent }
  | { type: 'plan-snapshot'; plan: PlanStep[] }
  | { type: 'history-entry'; entry: ChatMessageEntry }
  | { type: 'set-no-human-flag'; value: boolean }
  | { type: 'reset-reminder' };

export interface PlanRuntimeResult<T extends string> {
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

export const createEmitEffect = (event: RuntimeEvent): PlanRuntimeEffect => ({
  type: 'emit',
  event,
});

export const createPlanSnapshotEffect = (plan: PlanStep[]): PlanRuntimeEffect => ({
  type: 'plan-snapshot',
  plan: clonePlanForExecution(plan),
});

export const createHistoryEntryEffect = (entry: ChatMessageEntry): PlanRuntimeEffect => ({
  type: 'history-entry',
  entry,
});

export const createSetNoHumanFlagEffect = (value: boolean): PlanRuntimeEffect => ({
  type: 'set-no-human-flag',
  value,
});

export const createResetReminderEffect = (): PlanRuntimeEffect => ({ type: 'reset-reminder' });

export const createPlanObservationEffect = ({
  activePlan,
  passIndex,
}: {
  readonly activePlan: PlanStep[];
  readonly passIndex: number;
}): PlanRuntimeEffect =>
  createHistoryEntryEffect(
    createPlanObservationHistoryEntry({
      activePlan: clonePlanForExecution(activePlan),
      passIndex,
    }),
  );

export const toEmitEffects = (
  event: RuntimeEvent | RuntimeStatusEvent | null,
): PlanRuntimeEffect[] => (event ? [createEmitEffect(event as RuntimeEvent)] : []);

export interface PlanRuntimeEffectContext {
  readonly history: ChatMessageEntry[];
  readonly emitEvent?: ExecuteAgentPassOptions['emitEvent'];
  readonly setNoHumanFlag?: ExecuteAgentPassOptions['setNoHumanFlag'];
  readonly reminder: Pick<RuntimeReminderController, 'reset'>;
}

export const applyPlanRuntimeEffects = (
  effects: readonly PlanRuntimeEffect[],
  context: PlanRuntimeEffectContext,
): void => {
  for (const effect of effects) {
    switch (effect.type) {
      case 'emit':
        context.emitEvent?.(effect.event);
        break;
    case 'plan-snapshot':
      context.emitEvent?.({ type: 'plan', plan: clonePlanForExecution(effect.plan) } as RuntimeEvent);
      break;
      case 'history-entry':
        context.history.push(effect.entry);
        break;
      case 'set-no-human-flag':
        context.setNoHumanFlag?.(effect.value);
        break;
      case 'reset-reminder':
        context.reminder.reset();
        break;
    }
  }
};
