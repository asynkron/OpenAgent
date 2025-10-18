import type { PlanStep } from '../planExecution.js';
import type { ObservationRecord } from '../../historyMessageBuilder.js';
import { createCommandRejectionObservation } from './observationRecorder.js';
import type { PlanStateMachine } from './stateMachine/index.js';
import {
  createPlanObservationEffect,
  createResetReminderEffect,
  type CommandRejectionResult,
  toEmitEffects,
} from './effects.js';
export { handleNoExecutableMessage } from './noExecutableHandler.js';
export type { NoExecutableContext } from './noExecutableHandler.js';

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
