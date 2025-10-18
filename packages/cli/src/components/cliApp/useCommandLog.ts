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
import { parsePositiveInteger } from './runtimeUtils.js';
import { resolveCommandInspector } from './commandInspector.js';
import { normaliseCommandResultEvent } from './commandLogNormalizer.js';
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
      const normalised = normaliseCommandResultEvent(event);

      appendCommandResult('command-result', normalised.timelinePayload);

      if (normalised.command) {
        setCommandLog((prev) => {
          const entry = createCommandLogEntry(normalised.command);
          return appendWithLimit(prev, entry, limit).next;
        });
      }
    },
    [appendCommandResult, createCommandLogEntry, limit],
  );

  const executeCommandInspectorCommand = useCallback(
    (rest: string) => {
      const result = resolveCommandInspector({
        commandLog,
        rest,
        now: Date.now,
        parseCount: parsePositiveInteger,
      });

      setCommandInspector(result.state);
      result.statusMessages.forEach((payload) => {
        appendStatus(payload);
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
    if (!commandInspector || commandLog.length === 0) {
      return [];
    }

    const startIndex = Math.max(commandLog.length - commandInspector.requested, 0);

    return commandLog
      .slice(startIndex)
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
