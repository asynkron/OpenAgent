import type { TimelinePayload, CommandResultRuntimeEvent } from './types.js';
import { cloneValue, parsePositiveInteger } from './runtimeUtils.js';
import type { PlanStep } from '../planUtils.js';
import type {
  Command as CommandPayload,
  CommandExecution,
  CommandPreview,
  CommandResult,
} from '../commandUtils.js';

export type CommandRuntimePayloads = TimelinePayload<'command-result'>;

export interface InspectorRequestParseResult {
  count: number | null;
  hasExplicitInput: boolean;
}

/**
 * Clone the runtime payload so later mutations never leak into memoised React nodes.
 */
export function cloneCommandRuntimePayload(event: CommandResultRuntimeEvent): CommandRuntimePayloads {
  return {
    command: cloneValue(event.command ?? null) as CommandPayload | null,
    result: cloneValue(event.result ?? null) as CommandResult | null,
    preview: cloneValue(event.preview ?? null) as CommandPreview | null,
    execution: cloneValue(event.execution ?? null) as CommandExecution | null,
    planStep: cloneValue(event.planStep ?? null) as PlanStep | null,
  };
}

export function clampInspectorCount(total: number, requested: number): number {
  return Math.max(1, Math.min(total, requested));
}

/**
 * Normalise the slash command argument into a usable request count and track
 * whether the human explicitly supplied a value so we can surface warnings.
 */
export function parseInspectorArgument(rest: string): InspectorRequestParseResult {
  const trimmed = rest.trim();

  if (trimmed.length === 0) {
    return { count: null, hasExplicitInput: false };
  }

  const parsed = parsePositiveInteger(trimmed, Number.NaN);
  if (!Number.isFinite(parsed)) {
    return { count: null, hasExplicitInput: true };
  }

  return { count: parsed, hasExplicitInput: true };
}

export function buildInspectorStatusMessage(count: number): string {
  return count === 1
    ? 'Showing the most recent command payload.'
    : `Showing the ${count} most recent command payloads.`;
}
