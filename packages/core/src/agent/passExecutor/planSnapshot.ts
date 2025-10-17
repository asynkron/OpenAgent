import type { PlanEntry } from './planTypes.js';
import type { ObservationRecord } from '../historyMessageBuilder.js';
import { extractPlanStepIdentifier } from './planStepIdentifier.js';

export type PlanHistorySnapshot = Record<string, unknown>;

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export const buildPlanStepSnapshot = (step: PlanEntry): PlanHistorySnapshot => {
  const snapshot: PlanHistorySnapshot = {};

  if (Object.prototype.hasOwnProperty.call(step, 'id')) {
    snapshot.id = step.id;
  } else {
    const fallbackId = extractPlanStepIdentifier(step);
    if (fallbackId) {
      snapshot.id = fallbackId;
    }
  }

  const statusCandidate = (step as Record<string, unknown>).status;
  if (typeof statusCandidate === 'string' && statusCandidate.trim().length > 0) {
    snapshot.status = statusCandidate;
  }

  const observationCandidate = (step as Record<string, unknown>).observation;
  if (observationCandidate && typeof observationCandidate === 'object') {
    const observationForLLM = (observationCandidate as ObservationRecord).observation_for_llm;
    if (observationForLLM && typeof observationForLLM === 'object') {
      for (const [key, value] of Object.entries(observationForLLM)) {
        snapshot[key] = cloneJson(value);
      }
    }

    const metadata = (observationCandidate as ObservationRecord).observation_metadata;
    if (metadata && typeof metadata === 'object') {
      snapshot.metadata = cloneJson(metadata);
    }
  }

  if (!Object.prototype.hasOwnProperty.call(snapshot, 'status')) {
    snapshot.status = 'pending';
  }

  return snapshot;
};

export const summarizePlanForHistory = (
  plan: PlanEntry[] | null | undefined,
): PlanHistorySnapshot[] => {
  if (!Array.isArray(plan) || plan.length === 0) {
    return [];
  }

  return plan.map((step) => buildPlanStepSnapshot(step));
};
