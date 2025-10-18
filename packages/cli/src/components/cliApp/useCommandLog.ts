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
import { cloneValue } from './runtimeUtils.js';
import { cloneCommandResultPayload, resolveCommandInspector } from './useCommandLog.helpers.js';
import type { Command as CommandPayload } from '../commandUtils.js';

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
      const payload = cloneCommandResultPayload(event);
      appendCommandResult('command-result', payload);

      const commandPayload = payload.command;
      if (!commandPayload) {
        return;
      }

      setCommandLog((previousLog) => {
        const entry = createCommandLogEntry(commandPayload);
        return appendWithLimit(previousLog, entry, limit).next;
      });
    },
    [appendCommandResult, createCommandLogEntry, limit],
  );

  const executeCommandInspectorCommand = useCallback(
    (rest: string) => {
      const resolution = resolveCommandInspector(rest, commandLog.length, Date.now());
      setCommandInspector(resolution.inspector);
      resolution.statusMessages.forEach((status) => appendStatus(status));
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
    if (!commandInspector || commandLog.length === 0) {
      return [];
    }

    const safeCount = commandInspector.requested;

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
