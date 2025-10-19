import { PlanStatus, isTerminalStatus } from '@asynkron/openagent-core';

import { formatDebugPayload } from './logging.js';
import { cloneValue, parsePositiveInteger } from './runtimeUtils.js';
import type { PlanStep } from '../planUtils.js';
import type {
  Command as CommandPayload,
  CommandExecution,
  CommandPreview,
  CommandResult,
} from '../commandUtils.js';
import type {
  CommandLogEntry,
  CommandPanelEvent,
  CommandResultRuntimeEvent,
  TimelineCommandPayload,
  TimelinePayload,
} from './types.js';

const INVALID_REQUEST_MESSAGE =
  'Command inspector requires a positive integer. Showing the latest command instead.';

const PLAN_COMMAND_EVENT_ID_PREFIX = 'plan-step:';

const normalizeIdentifier = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
};

const buildPlanStepEventId = (planStep: { id?: unknown } | null | undefined): string | null => {
  if (!planStep || typeof planStep !== 'object') {
    return null;
  }

  const normalized = normalizeIdentifier((planStep as { id?: unknown }).id);
  if (!normalized) {
    return null;
  }

  return `${PLAN_COMMAND_EVENT_ID_PREFIX}${normalized}`;
};

const buildRuntimeEventId = (eventId: unknown): string | null => {
  if (typeof eventId !== 'string') {
    return null;
  }

  const trimmed = eventId.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const resolveCommandEventId = (
  event: CommandResultRuntimeEvent,
  planStep: PlanStep | null,
): string => {
  const planStepIdentifier = buildPlanStepEventId(planStep);
  if (planStepIdentifier) {
    return planStepIdentifier;
  }

  const fallbackIdentifier = buildRuntimeEventId((event as { __id?: unknown }).__id);
  if (!fallbackIdentifier) {
    throw new TypeError('Command runtime event expected string "__id".');
  }

  return fallbackIdentifier;
};

export type CommandInspectorResolution = {
  count: number;
  infoMessage: string;
  warningMessage: string | null;
};

export interface CommandResultTimelineUpdate {
  readonly payload: TimelinePayload<'command-result'>;
  readonly final: boolean;
}

export function createCommandResultPayload(
  event: CommandResultRuntimeEvent,
): CommandResultTimelineUpdate {
  const { command, result, preview, execution, observation, planStep, planSnapshot } =
    event.payload;

  const clonedPlanStep = clonePlanStep(planStep);
  const eventId = resolveCommandEventId(event, clonedPlanStep);

  const timelinePayload: TimelineCommandPayload = {
    eventId,
    command: cloneCommandPayload(command),
    result: cloneCommandResult(result),
    preview: cloneCommandPreview(preview),
    execution: cloneCommandExecution(execution),
    observation: extractObservationSummary(observation ?? planSnapshot?.summary ?? null),
    planStep: clonedPlanStep,
  };

  const statusCandidate = clonedPlanStep ? (clonedPlanStep as { status?: unknown }).status : null;
  const normalizedStatus =
    typeof statusCandidate === 'string' ? statusCandidate.trim().toLowerCase() : '';
  const isFinal = normalizedStatus === 'completed';

  return { payload: timelinePayload, final: isFinal } satisfies CommandResultTimelineUpdate;
}

export function createPlanCommandPayload(
  planStep: PlanStep | null,
): TimelinePayload<'command-result'> | null {
  if (!planStep || typeof planStep !== 'object') {
    return null;
  }

  const rawStatus = (planStep as { status?: unknown }).status;
  if (typeof rawStatus === 'string') {
    if (isTerminalStatus(rawStatus)) {
      return null;
    }

    if (rawStatus !== PlanStatus.Pending && rawStatus !== PlanStatus.Running) {
      return null;
    }
  }

  const eventId = buildPlanStepEventId(planStep);
  if (!eventId) {
    return null;
  }

  const commandPayload = cloneCommandPayload(planStep.command ?? null);
  if (!commandPayload) {
    return null;
  }

  return {
    eventId,
    command: commandPayload,
    result: null,
    preview: null,
    execution: null,
    observation: null,
    planStep: cloneValue(planStep) as PlanStep,
  } satisfies TimelinePayload<'command-result'>;
}

export function resolveCommandInspectorRequest(
  rest: string,
  totalCommands: number,
): CommandInspectorResolution {
  const trimmed = rest.trim();
  const parsed = trimmed.length === 0 ? 1 : parsePositiveInteger(trimmed, Number.NaN);

  if (!Number.isFinite(parsed)) {
    const count = clampCommandCount(1, totalCommands);
    return {
      count,
      infoMessage: buildInspectorInfoMessage(count),
      warningMessage: INVALID_REQUEST_MESSAGE,
    };
  }

  const count = clampCommandCount(parsed, totalCommands);
  return {
    count,
    infoMessage: buildInspectorInfoMessage(count),
    warningMessage: null,
  };
}

export function createCommandPanelEvents(
  commandLog: readonly CommandLogEntry[],
  requested: number,
): CommandPanelEvent[] {
  if (commandLog.length === 0 || requested <= 0) {
    return [];
  }

  const safeCount = clampCommandCount(requested, commandLog.length);
  const startIndex = commandLog.length - safeCount;
  const recentEntries = commandLog.slice(startIndex).reverse();

  return recentEntries.map((entry) => ({ id: entry.id, content: formatDebugPayload(entry.command) }));
}

function buildInspectorInfoMessage(count: number): string {
  if (count === 1) {
    return 'Showing the most recent command payload.';
  }

  return `Showing the ${count} most recent command payloads.`;
}

function clampCommandCount(requested: number, totalCommands: number): number {
  if (totalCommands <= 0) {
    return 0;
  }

  const upperBound = Math.max(1, totalCommands);
  const normalized = Math.max(1, Math.floor(requested));
  return Math.min(upperBound, normalized);
}

function cloneCommandPayload(command: unknown): CommandPayload | null {
  if (!command || typeof command !== 'object') {
    return null;
  }

  const source = command as {
    run?: unknown;
    reason?: unknown;
    description?: unknown;
  };

  const payload: CommandPayload = {};

  if (typeof source.run === 'string') {
    payload.run = source.run;
  }

  const descriptionCandidate = typeof source.description === 'string' ? source.description : null;
  if (descriptionCandidate) {
    payload.description = descriptionCandidate;
  } else if (typeof source.reason === 'string') {
    payload.description = source.reason;
  }

  return Object.keys(payload).length > 0 ? payload : null;
}

function cloneCommandResult(value: unknown): CommandResult | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const source = value as { exit_code?: unknown; killed?: unknown };
  const result: CommandResult = {};

  if (typeof source.exit_code === 'number') {
    result.exit_code = source.exit_code;
  } else if (source.exit_code === null) {
    result.exit_code = null;
  }
  if (typeof source.killed === 'boolean') {
    result.killed = source.killed;
  }

  return Object.keys(result).length > 0 ? result : null;
}

function cloneCommandPreview(value: unknown): CommandPreview | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const source = value as {
    stdoutPreview?: unknown;
    stderrPreview?: unknown;
    execution?: unknown;
  };

  const preview: CommandPreview = {};

  if (typeof source.stdoutPreview === 'string') {
    preview.stdoutPreview = source.stdoutPreview;
  }
  if (typeof source.stderrPreview === 'string') {
    preview.stderrPreview = source.stderrPreview;
  }
  if (source.execution && typeof source.execution === 'object') {
    preview.execution = cloneValue(source.execution) as CommandExecution | null;
  }

  return Object.keys(preview).length > 0 ? preview : null;
}

function cloneCommandExecution(value: unknown): CommandExecution | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  return cloneValue(value) as CommandExecution | null;
}

function clonePlanStep(value: unknown): PlanStep | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  return cloneValue(value) as PlanStep | null;
}

function extractObservationSummary(observation: unknown): string | null {
  if (!observation) {
    return null;
  }

  if (typeof observation === 'string') {
    return observation;
  }

  if (typeof observation !== 'object') {
    return null;
  }

  const record = (observation as { observation_for_llm?: unknown }).observation_for_llm;
  if (!record || typeof record !== 'object') {
    return null;
  }

  if ('summary' in record && typeof record.summary === 'string') {
    return record.summary;
  }

  if ('message' in record && typeof record.message === 'string') {
    return record.message;
  }

  return null;
}
