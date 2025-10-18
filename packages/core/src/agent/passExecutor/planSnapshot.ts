import type { PlanStep } from './planExecution.js';
import type {
  ObservationMetadata,
  ObservationParseAttempt,
  ObservationRecord,
  PlanSummary,
} from '../historyMessageBuilder.js';
import type { PlanObservation } from '../../contracts/index.js';
import { extractPlanStepIdentifier } from './planStepIdentifier.js';

export interface PlanHistorySnapshot {
  id?: string;
  status: string;
  stdout?: string;
  stderr?: string;
  truncated?: boolean;
  truncation_notice?: string;
  exit_code?: number;
  json_parse_error?: true;
  schema_validation_error?: true;
  response_validation_error?: true;
  canceled_by_human?: true;
  operation_canceled?: true;
  summary?: string;
  message?: string;
  reason?: string;
  details?: string[];
  attempts?: ObservationParseAttempt[];
  response_snippet?: string;
  plan?: PlanSummary;
  metadata?: ObservationMetadata;
}

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const toPlanSummaryEntry = (snapshot: PlanHistorySnapshot): Record<string, unknown> => {
  const plain: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(snapshot)) {
    if (value !== undefined) {
      plain[key] = value;
    }
  }
  return plain;
};

const normalizeStepId = (step: PlanStep): string | undefined => {
  if (typeof step.id === 'string' && step.id.trim()) {
    return step.id;
  }
  const fallbackId = extractPlanStepIdentifier(step);
  return fallbackId ?? undefined;
};

const populateObservationFields = (
  snapshot: PlanHistorySnapshot,
  observation: PlanObservation | ObservationRecord | null | undefined,
): void => {
  if (!observation || typeof observation !== 'object') {
    return;
  }

  const payload = observation.observation_for_llm;
  if (payload && typeof payload === 'object') {
    if ('stdout' in payload && typeof payload.stdout === 'string') {
      snapshot.stdout = payload.stdout;
    }
    if ('stderr' in payload && typeof payload.stderr === 'string') {
      snapshot.stderr = payload.stderr;
    }
    if ('truncated' in payload && typeof payload.truncated === 'boolean') {
      snapshot.truncated = payload.truncated;
    }
    if ('truncation_notice' in payload && typeof payload.truncation_notice === 'string') {
      snapshot.truncation_notice = payload.truncation_notice;
    }
    if ('exit_code' in payload && typeof payload.exit_code === 'number') {
      snapshot.exit_code = payload.exit_code;
    }
    if ('json_parse_error' in payload && payload.json_parse_error === true) {
      snapshot.json_parse_error = true;
      if ('message' in payload && typeof payload.message === 'string') {
        snapshot.message = payload.message;
      }
      if ('attempts' in payload && Array.isArray(payload.attempts)) {
        snapshot.attempts = cloneJson(payload.attempts as ObservationParseAttempt[]);
      }
      if ('response_snippet' in payload && typeof payload.response_snippet === 'string') {
        snapshot.response_snippet = payload.response_snippet;
      }
    }
    if ('schema_validation_error' in payload && payload.schema_validation_error === true) {
      snapshot.schema_validation_error = true;
      if ('message' in payload && typeof payload.message === 'string') {
        snapshot.message = payload.message;
      }
      if ('details' in payload && Array.isArray(payload.details)) {
        snapshot.details = cloneJson(payload.details as string[]);
      }
      if ('response_snippet' in payload && typeof payload.response_snippet === 'string') {
        snapshot.response_snippet = payload.response_snippet;
      }
    }
    if ('response_validation_error' in payload && payload.response_validation_error === true) {
      snapshot.response_validation_error = true;
      if ('message' in payload && typeof payload.message === 'string') {
        snapshot.message = payload.message;
      }
      if ('details' in payload && Array.isArray(payload.details)) {
        snapshot.details = cloneJson(payload.details as string[]);
      }
      if ('response_snippet' in payload && typeof payload.response_snippet === 'string') {
        snapshot.response_snippet = payload.response_snippet;
      }
    }
    if ('canceled_by_human' in payload && payload.canceled_by_human === true) {
      snapshot.canceled_by_human = true;
      if ('message' in payload && typeof payload.message === 'string') {
        snapshot.message = payload.message;
      }
    }
    if ('operation_canceled' in payload && payload.operation_canceled === true) {
      snapshot.operation_canceled = true;
      if ('reason' in payload && typeof payload.reason === 'string') {
        snapshot.reason = payload.reason;
      }
      if ('message' in payload && typeof payload.message === 'string') {
        snapshot.message = payload.message;
      }
    }
    if ('plan' in payload && Array.isArray(payload.plan)) {
      snapshot.plan = cloneJson(payload.plan as PlanSummary);
    }
    if ('summary' in payload && typeof payload.summary === 'string') {
      snapshot.summary = payload.summary;
    }
  }

  const metadata = observation.observation_metadata;
  if (metadata && typeof metadata === 'object') {
    snapshot.metadata = cloneJson(metadata) as ObservationMetadata;
  }
};

export const buildPlanStepSnapshot = (step: PlanStep): PlanHistorySnapshot => {
  const snapshot: PlanHistorySnapshot = { status: 'pending' };

  const id = normalizeStepId(step);
  if (id) {
    snapshot.id = id;
  }

  if (typeof step.status === 'string' && step.status.trim()) {
    snapshot.status = step.status;
  }

  populateObservationFields(snapshot, step.observation);

  return snapshot;
};

export const summarizePlanForHistory = (
  plan: PlanStep[] | null | undefined,
): PlanHistorySnapshot[] => {
  if (!Array.isArray(plan) || plan.length === 0) {
    return [];
  }

  return plan.map((step) => buildPlanStepSnapshot(step));
};

export const summarizePlanForObservation = (plan: PlanStep[] | null | undefined): PlanSummary =>
  summarizePlanForHistory(plan).map(toPlanSummaryEntry);
