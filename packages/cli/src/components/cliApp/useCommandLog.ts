import { useCallback, useMemo, useRef, useState } from 'react';

import type {
  AppendTimelineEntry,
  CommandInspectorState,
  CommandLogEntry,
  CommandPanelEvent,
  CommandResultRuntimeEvent,
  SlashCommandHandler,
  TimelinePayload,
} from './types.js';
import { appendWithLimit, formatDebugPayload } from './logging.js';
import { cloneValue, parsePositiveInteger } from './runtimeUtils.js';
import type { PlanStep } from '../planUtils.js';
import type {
  Command as CommandPayload,
  CommandExecution,
  CommandPreview,
  CommandResult,
} from '../commandUtils.js';

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

  const createCommandLogEntry = useCallback(
    (commandPayload: CommandPayload): CommandLogEntry => {
      const entry: CommandLogEntry = {
        id: commandLogIdRef.current + 1,
        command: cloneValue(commandPayload),
        receivedAt: Date.now(),
      };
      commandLogIdRef.current = entry.id;
      return entry;
    },
    [],
  );

  const handleCommandEvent = useCallback(
    (event: CommandResultRuntimeEvent) => {
      const commandPayload = cloneValue(event.command ?? null) as CommandPayload | null;
      const resultPayload = cloneValue(event.result ?? null) as CommandResult | null;
      const previewPayload = cloneValue(event.preview ?? null) as CommandPreview | null;
      const executionPayload = cloneValue(event.execution ?? null) as CommandExecution | null;
      const planStepPayload = cloneValue(event.planStep ?? null) as PlanStep | null;

      appendCommandResult('command-result', {
        command: commandPayload,
        result: resultPayload,
        preview: previewPayload,
        execution: executionPayload,
        planStep: planStepPayload,
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
