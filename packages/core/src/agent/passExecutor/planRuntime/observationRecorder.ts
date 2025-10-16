import { createObservationHistoryEntry } from '../../historyMessageBuilder.js';
import type { ChatMessageEntry } from '../../historyEntry.js';
import type { PlanStep, PlanStepObservation } from '../planExecution.js';
import { summarizePlanForHistory } from '../planSnapshot.js';

export const buildPlanObservation = (
  activePlan: PlanStep[],
  timestamp: Date = new Date(),
): PlanStepObservation => ({
  observation_for_llm: {
    plan: summarizePlanForHistory(activePlan),
  },
  observation_metadata: {
    timestamp: timestamp.toISOString(),
  },
});

export const createPlanObservationHistoryEntry = ({
  activePlan,
  passIndex,
  timestamp = new Date(),
}: {
  activePlan: PlanStep[];
  passIndex: number;
  timestamp?: Date;
}): ChatMessageEntry =>
  createObservationHistoryEntry({
    observation: buildPlanObservation(activePlan, timestamp),
    pass: passIndex,
  });

export const createCommandRejectionObservation = (
  timestamp: Date = new Date(),
): PlanStepObservation => ({
  observation_for_llm: {
    canceled_by_human: true,
    message:
      'Human declined to execute the proposed command and asked the AI to propose an alternative approach without executing a command.',
  },
  observation_metadata: { timestamp: timestamp.toISOString() },
});
