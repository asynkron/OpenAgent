import {
  createObservationHistoryEntry,
  type CommandRejectedObservationForLLM,
  type ObservationRecord,
  type PlanObservationForLLM,
} from '../../historyMessageBuilder.js';
import type { ChatMessageEntry } from '../../historyEntry.js';
import type { PlanStep } from '../planExecution.js';
import { summarizePlanForHistory } from '../planSnapshot.js';

export const buildPlanObservation = (
  activePlan: PlanStep[],
  timestamp: Date = new Date(),
): ObservationRecord => {
  const planObservation: PlanObservationForLLM = {
    plan: summarizePlanForHistory(activePlan),
  };

  return {
    observation_for_llm: planObservation,
    observation_metadata: {
      timestamp: timestamp.toISOString(),
    },
  };
};

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
): ObservationRecord => {
  const payload: CommandRejectedObservationForLLM = {
    canceled_by_human: true,
    message:
      'Human declined to execute the proposed command and asked the AI to propose an alternative approach without executing a command.',
  };

  return {
    observation_for_llm: payload,
    observation_metadata: { timestamp: timestamp.toISOString() },
  };
};
