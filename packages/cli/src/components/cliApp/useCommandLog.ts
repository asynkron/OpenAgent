import { useCallback, useMemo, useRef, useState } from 'react';

import type {
  CommandInspectorState,
  CommandLogEntry,
  CommandPanelEvent,
  CommandResultRuntimeEvent,
  SlashCommandHandler,
  TimelinePayload,
} from './types.js';
import { appendWithLimit, formatDebugPayload } from './logging.js';
import { cloneValue, parsePositiveInteger } from './runtimeUtils.js';
import type { AppendTimelineEntry } from './useTimeline.js';

export interface UseCommandLogOptions {
  limit: number;
  appendCommandResult: AppendTimelineEntry;
  appendStatus: (status: TimelinePayload<'status'>) => void;
}

/**
 * Manages the recent command payload log and related slash command without bloating CliApp.
 */
export function useCommandLog({ limit, appendCommandResult, appendStatus }: UseCommandLogOptions): {
  commandPanelEvents: CommandPanelEvent[];
  commandPanelKey: number | null;
  handleCommandEvent: (event: CommandResultRuntimeEvent) => void;
  handleCommandInspectorCommand: SlashCommandHandler;
} {
  const commandLogIdRef = useRef(0);
  const [commandLog, setCommandLog] = useState<CommandLogEntry[]>([]);
  const [commandInspector, setCommandInspector] = useState<CommandInspectorState | null>(null);

  const createCommandLogEntry = useCallback((commandPayload: unknown): CommandLogEntry => {
    const entry = {
      id: commandLogIdRef.current + 1,
      command: cloneValue(commandPayload),
      receivedAt: Date.now(),
    } satisfies CommandLogEntry;
    commandLogIdRef.current = entry.id;
    return entry;
  }, []);

  const handleCommandEvent = useCallback(
    (event: CommandResultRuntimeEvent) => {
      const commandPayload = cloneValue(event.command ?? null);
      const resultPayload = cloneValue(event.result ?? null);
      const previewPayload = cloneValue(event.preview ?? {});
      const executionPayload = cloneValue(event.execution ?? null);

      appendCommandResult('command-result', {
        command: commandPayload,
        result: resultPayload,
        preview: previewPayload,
        execution: executionPayload,
      });

      if (commandPayload) {
        setCommandLog((prev) => {
          const entry = createCommandLogEntry(commandPayload);
          return appendWithLimit(prev, entry, limit).next;
        });
      }
    },
    [appendCommandResult, createCommandLogEntry, limit],
  );

  const executeCommandInspectorCommand = useCallback(
    (rest: string) => {
      if (!commandLog || commandLog.length === 0) {
        appendStatus({ level: 'info', message: 'No commands have been received yet.' });
        setCommandInspector(null);
        return;
      }

      let requested = 1;
      if (rest.length > 0) {
        const parsed = parsePositiveInteger(rest, Number.NaN);
        if (!Number.isFinite(parsed)) {
          appendStatus({
            level: 'warn',
            message:
              'Command inspector requires a positive integer. Showing the latest command instead.',
          });
        } else {
          requested = parsed;
        }
      }

      const safeCount = Math.max(1, Math.min(commandLog.length, requested));
      const panelKey = Date.now();
      setCommandInspector({ requested: safeCount, token: panelKey });

      appendStatus({
        level: 'info',
        message:
          safeCount === 1
            ? 'Showing the most recent command payload.'
            : `Showing the ${safeCount} most recent command payloads.`,
      });
    },
    [appendStatus, commandLog],
  );

  const handleCommandInspectorCommand = useCallback<SlashCommandHandler>(
    (rest) => {
      executeCommandInspectorCommand(rest);
      return true;
    },
    [executeCommandInspectorCommand],
  );

  const commandPanelEvents = useMemo<CommandPanelEvent[]>(() => {
    if (!commandInspector || !commandLog.length) {
      return [];
    }

    const safeCount = Math.max(
      1,
      Math.min(commandLog.length, parsePositiveInteger(commandInspector.requested, 1)),
    );

    return commandLog
      .slice(commandLog.length - safeCount)
      .reverse()
      .map((entry) => ({ id: entry.id, content: formatDebugPayload(entry.command) }));
  }, [commandInspector, commandLog]);

  return {
    commandPanelEvents,
    commandPanelKey: commandInspector?.token ?? null,
    handleCommandEvent,
    handleCommandInspectorCommand,
  };
}
