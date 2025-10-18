import type { PlanStep } from '../planExecution.js';
import type { ObservationRecord } from '../../historyMessageBuilder.js';
import { createCommandRejectionObservation } from './observationRecorder.js';
import type { PlanStateMachine } from './stateMachine/index.js';
import {
  createPlanObservationEffect,
  createPlanSnapshotEffect,
  createResetReminderEffect,
  createSetNoHumanFlagEffect,
  type CommandRejectionResult,
  type HandleNoExecutableResult,
  toEmitEffects,
} from './effects.js';
import { normalizeAssistantMessage } from '../planStepStatus.js';
import type { PlanPersistenceCoordinator } from './persistenceCoordinator.js';
import { resetPlanStateFromPersistence } from './persistenceEffects.js';
import { maybeCreateRefusalEffects } from './refusalEffects.js';

export interface NoExecutableContext {
  readonly parsedMessage: string;
  readonly persistence: PlanPersistenceCoordinator;
  readonly stateMachine: PlanStateMachine;
  readonly passIndex: number;
  readonly getNoHumanFlag?: () => boolean;
  readonly setNoHumanFlag?: (value: boolean) => void;
}

export const handleNoExecutableMessage = async ({
  parsedMessage,
  persistence,
  stateMachine,
  passIndex,
  getNoHumanFlag,
  setNoHumanFlag,
}: NoExecutableContext): Promise<HandleNoExecutableResult> => {
  const effects = [] as HandleNoExecutableResult['effects'];

  if (
    typeof getNoHumanFlag === 'function' &&
    typeof setNoHumanFlag === 'function' &&
    getNoHumanFlag()
  ) {
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

  const refusalEffects = maybeCreateRefusalEffects({
    normalizedMessage,
    passIndex,
    activePlanEmpty,
    incomingPlanEmpty,
  });
  if (refusalEffects) {
    effects.push(...refusalEffects);
    return { type: 'continue-refusal', effects } satisfies HandleNoExecutableResult;
  }

  if (!activePlanEmpty && stateMachine.hasPendingExecutableWork()) {
    effects.push(createPlanSnapshotEffect(stateMachine.cloneActivePlan()));
    effects.push(createResetReminderEffect());
    return { type: 'continue-pending', effects } satisfies HandleNoExecutableResult;
  }

  if (activePlanEmpty) {
    effects.push(
      ...(await resetPlanStateFromPersistence({
        persistence,
        stateMachine,
      })),
    );
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

  const observation: ObservationRecord = createCommandRejectionObservation();
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
