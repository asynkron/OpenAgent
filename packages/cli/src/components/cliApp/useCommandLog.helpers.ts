import { cloneValue } from './runtimeUtils.js';
import type { CommandInspectorState, CommandResultRuntimeEvent, TimelinePayload } from './types.js';
import type { PlanStep } from '../planUtils.js';
import type {
  Command as CommandPayload,
  CommandExecution,
  CommandPreview,
  CommandResult,
} from '../commandUtils.js';

export const COMMAND_INSPECTOR_INVALID_MESSAGE =
  'Command inspector requires a positive integer. Showing the latest command instead.';

export const COMMAND_INSPECTOR_DEFAULT_COUNT = 1;

interface CommandInspectorResolution {
  inspector: CommandInspectorState | null;
  statusMessages: Array<TimelinePayload<'status'>>;
}

export function cloneCommandResultPayload(
  event: CommandResultRuntimeEvent,
): TimelinePayload<'command-result'> {
  return {
    command: cloneValue(event.command ?? null) as CommandPayload | null,
    result: cloneValue(event.result ?? null) as CommandResult | null,
    preview: cloneValue(event.preview ?? null) as CommandPreview | null,
    execution: cloneValue(event.execution ?? null) as CommandExecution | null,
    planStep: cloneValue(event.planStep ?? null) as PlanStep | null,
  };
}

export function resolveCommandInspector(
  rest: string,
  commandCount: number,
  timestamp: number,
): CommandInspectorResolution {
  if (commandCount <= 0) {
    return {
      inspector: null,
      statusMessages: [{ level: 'info', message: 'No commands have been received yet.' }],
    };
  }

  const trimmed = rest.trim();
  const hasInput = trimmed.length > 0;
  const parsed = hasInput ? Number.parseInt(trimmed, 10) : COMMAND_INSPECTOR_DEFAULT_COUNT;
  const isValid = Number.isFinite(parsed) && parsed > 0;
  const requested = isValid ? Math.floor(parsed) : COMMAND_INSPECTOR_DEFAULT_COUNT;
  const safeCount = Math.max(COMMAND_INSPECTOR_DEFAULT_COUNT, Math.min(commandCount, requested));

  const statusMessages: Array<TimelinePayload<'status'>> = [
    {
      level: 'info',
      message:
        safeCount === 1
          ? 'Showing the most recent command payload.'
          : `Showing the ${safeCount} most recent command payloads.`,
    },
  ];

  if (hasInput && !isValid) {
    statusMessages.unshift({ level: 'warn', message: COMMAND_INSPECTOR_INVALID_MESSAGE });
  }

  return {
    inspector: { requested: safeCount, token: timestamp },
    statusMessages,
  };
}
