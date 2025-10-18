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
  TimelinePayload,
} from './types.js';

const INVALID_REQUEST_MESSAGE =
  'Command inspector requires a positive integer. Showing the latest command instead.';

export type CommandInspectorResolution = {
  count: number;
  infoMessage: string;
  warningMessage: string | null;
};

export function createCommandResultPayload(
  event: CommandResultRuntimeEvent,
): TimelinePayload<'command-result'> {
  const commandPayload = event.command as CommandPayload | null | undefined;
  const resultPayload = event.result as CommandResult | null | undefined;
  const previewPayload = event.preview as CommandPreview | null | undefined;
  const executionPayload = event.execution as CommandExecution | null | undefined;
  const planStepPayload = event.planStep as PlanStep | null | undefined;

  return {
    command: cloneCommandPayload(commandPayload),
    result: cloneCommandResult(resultPayload),
    preview: cloneCommandPreview(previewPayload),
    execution: cloneCommandExecution(executionPayload),
    planStep: clonePlanStep(planStepPayload),
  };
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

function cloneCommandPayload(value: CommandPayload | null | undefined): CommandPayload | null {
  if (!value) {
    return null;
  }

  return cloneValue(value) as CommandPayload;
}

function cloneCommandResult(value: CommandResult | null | undefined): CommandResult | null {
  return cloneValue(value ?? null) as CommandResult | null;
}

function cloneCommandPreview(value: CommandPreview | null | undefined): CommandPreview | null {
  return cloneValue(value ?? null) as CommandPreview | null;
}

function cloneCommandExecution(value: CommandExecution | null | undefined): CommandExecution | null {
  return cloneValue(value ?? null) as CommandExecution | null;
}

function clonePlanStep(value: PlanStep | null | undefined): PlanStep | null {
  return cloneValue(value ?? null) as PlanStep | null;
}
