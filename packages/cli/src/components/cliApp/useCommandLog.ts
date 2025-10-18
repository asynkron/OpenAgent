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
import { appendWithLimit } from './logging.js';
import { cloneValue } from './runtimeUtils.js';
import {
  createCommandPanelEvents,
  createCommandResultPayload,
  resolveCommandInspectorRequest,
} from './commandLogHelpers.js';
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
      appendCommandResult('command-result', createCommandResultPayload(event));

      const commandPayload = event.command as CommandPayload | null | undefined;
      if (!commandPayload) {
        return;
      }

      setCommandLog((prev) => {
        const entry = createCommandLogEntry(commandPayload);
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

      const resolution = resolveCommandInspectorRequest(rest, commandLog.length);
      const panelKey = Date.now();
      setCommandInspector({ requested: resolution.count, token: panelKey });

      if (resolution.warningMessage) {
        appendStatus({ level: 'warn', message: resolution.warningMessage });
      }

      appendStatus({ level: 'info', message: resolution.infoMessage });
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
    if (!commandInspector) {
      return [];
    }

    return createCommandPanelEvents(commandLog, commandInspector.requested);
  }, [commandInspector, commandLog]);

  return {
    commandPanelEvents,
    commandPanelKey: commandInspector?.token ?? null,
    handleCommandEvent,
    handleCommandInspectorCommand,
  };
}
