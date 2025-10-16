import type { PlanStep, PlanStepObservation } from '../planExecution.js';
import type { PlanManagerAdapter } from '../planManagerAdapter.js';
import { refusalHeuristics } from '../refusalDetection.js';
import { createRefusalAutoResponseEntry } from '../../historyMessageBuilder.js';
import { createCommandRejectionObservation } from './observationRecorder.js';
import type { PlanStateMachine } from './stateMachine/index.js';
import {
  createHistoryEntryEffect,
  createPlanObservationEffect,
  createPlanSnapshotEffect,
  createResetReminderEffect,
  createSetNoHumanFlagEffect,
  type CommandRejectionResult,
  type HandleNoExecutableResult,
  toEmitEffects,
} from './effects.js';
import { resetPersistedPlan } from './persistence.js';
import { normalizeAssistantMessage } from '../planStepStatus.js';

export interface NoExecutableContext {
  readonly parsedMessage: string;
  readonly planManager: PlanManagerAdapter | null;
  readonly stateMachine: PlanStateMachine;
  readonly passIndex: number;
  readonly getNoHumanFlag?: () => boolean;
  readonly setNoHumanFlag?: (value: boolean) => void;
}

export const handleNoExecutableMessage = async ({
  parsedMessage,
  planManager,
  stateMachine,
  passIndex,
  getNoHumanFlag,
  setNoHumanFlag,
}: NoExecutableContext): Promise<HandleNoExecutableResult> => {
  const effects = [] as HandleNoExecutableResult['effects'];

  if (typeof getNoHumanFlag === 'function' && typeof setNoHumanFlag === 'function' && getNoHumanFlag()) {
    const normalizedMessage = normalizeAssistantMessage(parsedMessage.trim().toLowerCase());
    if (normalizedMessage.replace(/[.!]+$/, '') === 'done') {
      effects.push(createSetNoHumanFlagEffect(false));
    }
  }

  const trimmedMessage = parsedMessage.trim();
  const normalizedMessage = normalizeAssistantMessage(trimmedMessage);
  const activePlanEmpty = stateMachine.state.activePlan.length === 0;
  const incomingPlanEmpty =
    !stateMachine.state.initialIncomingPlan || stateMachine.state.initialIncomingPlan.length === 0;

  if (activePlanEmpty && incomingPlanEmpty && refusalHeuristics.isLikelyRefusalMessage(normalizedMessage)) {
    effects.push(
      ...toEmitEffects({
        type: 'status',
        level: 'info',
        message: refusalHeuristics.statusMessage,
      }),
    );

    effects.push(
      createHistoryEntryEffect(
        createRefusalAutoResponseEntry({
          autoResponseMessage: refusalHeuristics.autoResponse,
          pass: passIndex,
        }),
      ),
    );

    effects.push(createResetReminderEffect());
    return { type: 'continue-refusal', effects } satisfies HandleNoExecutableResult;
  }

  if (!activePlanEmpty && stateMachine.hasPendingExecutableWork()) {
    effects.push(createPlanSnapshotEffect(stateMachine.cloneActivePlan()));
    effects.push(createResetReminderEffect());
    return { type: 'continue-pending', effects } satisfies HandleNoExecutableResult;
  }

  if (activePlanEmpty) {
    const cleared = await resetPersistedPlan(planManager);
    effects.push(...toEmitEffects(cleared.warning));
    stateMachine.replaceActivePlan(cleared.plan);
    effects.push(createPlanSnapshotEffect(stateMachine.cloneActivePlan()));
    stateMachine.resetMutationFlag();
  }

  effects.push(createResetReminderEffect());
  return { type: 'stop-cleared', effects } satisfies HandleNoExecutableResult;
};

export interface CommandRejectionContext {
  readonly planStep: PlanStep | null;
  readonly stateMachine: PlanStateMachine;
  readonly passIndex: number;
}

export const handleCommandRejection = ({
  planStep,
  stateMachine,
  passIndex,
}: CommandRejectionContext): CommandRejectionResult => {
  const effects = [
    ...toEmitEffects({
      type: 'status',
      level: 'warn',
      message: 'Command execution canceled by human request.',
    }),
  ] as CommandRejectionResult['effects'];

  const observation: PlanStepObservation = createCommandRejectionObservation();
  stateMachine.attachObservation(planStep, observation);

  effects.push(
    createPlanObservationEffect({
      activePlan: stateMachine.cloneActivePlan(),
      passIndex,
    }),
  );
  effects.push(createResetReminderEffect());

  return { type: 'command-rejected', effects } satisfies CommandRejectionResult;
};
