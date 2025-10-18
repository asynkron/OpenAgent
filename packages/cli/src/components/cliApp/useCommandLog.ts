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
import {
  buildInspectorStatusMessage,
  clampInspectorCount,
  cloneCommandRuntimePayload,
  parseInspectorArgument,
} from './commandLogHelpers.js';

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
    (commandPayload: CommandLogEntry['command']): CommandLogEntry => {
      const entry: CommandLogEntry = {
        id: commandLogIdRef.current + 1,
        command: commandPayload,
        receivedAt: Date.now(),
      };
      commandLogIdRef.current = entry.id;
      return entry;
    },
    [],
  );

  const handleCommandEvent = useCallback(
    (event: CommandResultRuntimeEvent) => {
      const payload = cloneCommandRuntimePayload(event);

      appendCommandResult('command-result', payload);

      if (!payload.command) {
        return;
      }

      setCommandLog((prev) => {
        const entry = createCommandLogEntry(payload.command);
        return appendWithLimit(prev, entry, limit).next;
      });
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

      const { count, hasExplicitInput } = parseInspectorArgument(rest);
      if (count === null && hasExplicitInput) {
        appendStatus({
          level: 'warn',
          message:
            'Command inspector requires a positive integer. Showing the latest command instead.',
        });
      }

      const requested = clampInspectorCount(commandLog.length, count ?? 1);
      const panelKey = Date.now();
      setCommandInspector({ requested, token: panelKey });

      appendStatus({
        level: 'info',
        message: buildInspectorStatusMessage(requested),
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

    const safeCount = clampInspectorCount(commandLog.length, commandInspector.requested);

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
