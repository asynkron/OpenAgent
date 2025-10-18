import type { CommandInspectorState, CommandLogEntry, TimelinePayload } from './types.js';

interface CommandInspectorInput {
  readonly commandLog: readonly CommandLogEntry[];
  readonly rest: string;
  readonly now: () => number;
  readonly parseCount: (value: string, fallback: number) => number;
}

interface CommandInspectorResult {
  readonly state: CommandInspectorState | null;
  readonly statusMessages: readonly TimelinePayload<'status'>[];
}

const NO_COMMANDS_MESSAGE: TimelinePayload<'status'> = {
  level: 'info',
  message: 'No commands have been received yet.',
};

const NON_NUMERIC_MESSAGE: TimelinePayload<'status'> = {
  level: 'warn',
  message: 'Command inspector requires a positive integer. Showing the latest command instead.',
};

/**
 * Normalises command inspector requests before `useCommandLog` mutates state.
 */
export function resolveCommandInspector({
  commandLog,
  rest,
  now,
  parseCount,
}: CommandInspectorInput): CommandInspectorResult {
  if (commandLog.length === 0) {
    return {
      state: null,
      statusMessages: [NO_COMMANDS_MESSAGE],
    };
  }

  const statusMessages: TimelinePayload<'status'>[] = [];
  let requestedCount = 1;

  if (rest.length > 0) {
    const parsed = parseCount(rest, Number.NaN);
    if (!Number.isFinite(parsed)) {
      statusMessages.push(NON_NUMERIC_MESSAGE);
    } else {
      requestedCount = parsed;
    }
  }

  const safeCount = clampCount(requestedCount, commandLog.length);
  const state: CommandInspectorState = { requested: safeCount, token: now() };

  statusMessages.push(buildSummaryMessage(safeCount));

  return {
    state,
    statusMessages,
  };
}

function clampCount(requestedCount: number, available: number): number {
  if (requestedCount < 1) {
    return 1;
  }

  if (requestedCount > available) {
    return available;
  }

  return requestedCount;
}

function buildSummaryMessage(safeCount: number): TimelinePayload<'status'> {
  if (safeCount === 1) {
    return {
      level: 'info',
      message: 'Showing the most recent command payload.',
    };
  }

  return {
    level: 'info',
    message: `Showing the ${safeCount} most recent command payloads.`,
  };
}
