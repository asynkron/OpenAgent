import type { ToolCommand, ToolPlanStep } from '../contracts/index.js';
import type { PlanStatus as KnownPlanStatus } from './planStatusUtils.js';

const hasStructuredClone = typeof globalThis.structuredClone === 'function';

export const deepCloneValue = <T>(value: T): T => {
  if (hasStructuredClone) {
    try {
      return globalThis.structuredClone(value);
    } catch {
      // Fall through to JSON fallback.
    }
  }

  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    // As a last resort return the original reference.
    return value;
  }
};

export interface PlanObservationForLLM {
  plan?: ReadonlyArray<Record<string, unknown>>;
  json_parse_error?: boolean;
  schema_validation_error?: boolean;
  response_validation_error?: boolean;
  canceled_by_human?: boolean;
  operation_canceled?: boolean;
  exit_code?: number;
  truncated?: boolean;
  truncation_notice?: string;
  message?: string;
}

export interface PlanObservationMetadata extends Record<string, unknown> {
  timestamp?: string;
  runtime_ms?: number;
  killed?: boolean;
}

export interface PlanObservation {
  observation_for_llm?: PlanObservationForLLM | null;
  observation_metadata?: PlanObservationMetadata | null;
}

export interface PlanCommand extends Partial<ToolCommand>, Record<string, unknown> {
  key?: string;
}

export type PlanStatus = KnownPlanStatus | (string & {});

export interface PlanItem
  extends Omit<Partial<ToolPlanStep>, 'command' | 'waitingForId' | 'status' | 'observation'> {
  id: string;
  title: string;
  status: PlanStatus;
  waitingForId: string[];
  command?: PlanCommand | null;
  observation?: PlanObservation;
  priority?: number | string;
}

export type PlanTree = PlanItem[];

const KNOWN_PLAN_STATUSES = new Set<KnownPlanStatus>([
  'pending',
  'running',
  'completed',
  'failed',
  'abandoned',
]);

const resolvePlanStatus = (value: unknown): PlanStatus => {
  if (typeof value !== 'string') {
    return 'pending';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return 'pending';
  }

  const normalized = trimmed.toLowerCase();
  if (KNOWN_PLAN_STATUSES.has(normalized as KnownPlanStatus)) {
    return normalized as KnownPlanStatus;
  }

  return trimmed;
};

const sanitizeWaitingForIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized: string[] = [];
  const seen = new Set<string>();

  value.forEach((candidate) => {
    if (typeof candidate !== 'string' && typeof candidate !== 'number') {
      return;
    }
    const identifier = String(candidate).trim();
    if (!identifier || seen.has(identifier)) {
      return;
    }
    seen.add(identifier);
    normalized.push(identifier);
  });

  return normalized;
};

const sanitizeCommand = (value: unknown): PlanCommand | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const source = value as Partial<ToolCommand> & { key?: unknown };
  const normalized: PlanCommand = {};

  if (typeof source.reason === 'string') {
    normalized.reason = source.reason;
  }
  if (typeof source.shell === 'string') {
    normalized.shell = source.shell;
  }
  if (typeof source.run === 'string') {
    normalized.run = source.run;
  }
  if (typeof source.cwd === 'string') {
    normalized.cwd = source.cwd;
  }
  if (typeof source.timeout_sec === 'number') {
    normalized.timeout_sec = source.timeout_sec;
  }
  if (typeof source.filter_regex === 'string') {
    normalized.filter_regex = source.filter_regex;
  }
  if (typeof source.tail_lines === 'number') {
    normalized.tail_lines = source.tail_lines;
  }
  if (typeof source.max_bytes === 'number') {
    normalized.max_bytes = source.max_bytes;
  }
  if (typeof source.key === 'string') {
    normalized.key = source.key;
  }

  return Object.keys(normalized).length > 0 ? normalized : {};
};

const sanitizeObservation = (value: unknown): PlanObservation | undefined => {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const source = value as PlanObservation;
  const observation: PlanObservation = {};

  if (source.observation_for_llm && typeof source.observation_for_llm === 'object') {
    observation.observation_for_llm = source.observation_for_llm;
  }

  if (source.observation_metadata && typeof source.observation_metadata === 'object') {
    observation.observation_metadata = source.observation_metadata;
  }

  return observation;
};

const toPlanItem = (value: unknown): PlanItem | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<PlanItem>;
  const id = typeof candidate.id === 'string' ? candidate.id : typeof candidate.id === 'number' ? String(candidate.id) : '';
  const title = typeof candidate.title === 'string' ? candidate.title : '';
  const status = resolvePlanStatus(candidate.status);
  const waitingForId = sanitizeWaitingForIds(candidate.waitingForId);
  const command = sanitizeCommand(candidate.command);
  const observation = sanitizeObservation(candidate.observation);
  const priority =
    typeof candidate.priority === 'number' || typeof candidate.priority === 'string'
      ? candidate.priority
      : undefined;

  return {
    id,
    title,
    status,
    waitingForId,
    command: command ?? undefined,
    observation,
    priority,
  } satisfies PlanItem;
};

export const clonePlanTree = (plan: unknown): PlanTree => {
  if (!Array.isArray(plan)) {
    return [];
  }

  const cloned = deepCloneValue(plan);
  if (!Array.isArray(cloned)) {
    return [];
  }

  const normalized: PlanTree = [];
  cloned.forEach((item) => {
    const planItem = toPlanItem(item);
    if (planItem) {
      normalized.push(planItem);
    }
  });

  return normalized;
};
