import { useCallback, useMemo, useRef, useState } from 'react';

import type {
  CommandInspectorState,
  CommandLogEntry,
  CommandPanelEvent,
  CommandResultRuntimeEvent,
  SlashCommandHandler,
  TimelinePayload,
  UpsertCommandTimelineEntry,
} from './types.js';
import { cloneValue } from './runtimeUtils.js';
import {
  createCommandPanelEvents,
  createCommandResultPayload,
  resolveCommandInspectorRequest,
} from './commandLogHelpers.js';
import type { Command as CommandPayload } from '../commandUtils.js';

export interface UseCommandLogOptions {
  limit: number;
  upsertCommandResult: UpsertCommandTimelineEntry;
  appendStatus: (status: TimelinePayload<'status'>) => void;
}

/**
 * Manages the recent command payload log and related slash command without bloating CliApp.
 */
export function useCommandLog({ limit, upsertCommandResult, appendStatus }: UseCommandLogOptions): {
  commandPanelEvents: CommandPanelEvent[];
  commandPanelKey: number | null;
  handleCommandEvent: (event: CommandResultRuntimeEvent) => void;
  handleCommandInspectorCommand: SlashCommandHandler;
} {
  const commandLogIdRef = useRef(0);
  const commandLogSnapshotRef = useRef<CommandLogEntry[]>([]);
  const [commandLog, setCommandLogState] = useState<CommandLogEntry[]>([]);
  const [commandInspector, setCommandInspector] = useState<CommandInspectorState | null>(null);
  const commandEventIdMapRef = useRef<Map<string, number>>(new Map());

  const setCommandLog = useCallback(
    (update: CommandLogEntry[] | ((previous: CommandLogEntry[]) => CommandLogEntry[])) => {
      setCommandLogState((previous) => {
        const nextValue =
          typeof update === 'function'
            ? (update as (value: CommandLogEntry[]) => CommandLogEntry[])(previous)
            : update;
        commandLogSnapshotRef.current = nextValue;
        return nextValue;
      });
    },
    [setCommandLogState],
  );

  if (commandLogSnapshotRef.current !== commandLog) {
    commandLogSnapshotRef.current = commandLog;
  }

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
      const timelinePayload = createCommandResultPayload(event);
      upsertCommandResult(timelinePayload);

      const commandPayload = timelinePayload.command as CommandPayload | null | undefined;
      if (!commandPayload) {
        return;
      }

      const eventId = timelinePayload.eventId;

      setCommandLog((prev) => {
        const existingId = commandEventIdMapRef.current.get(eventId);
        if (existingId) {
          return prev.map((entry) =>
            entry.id === existingId
              ? { ...entry, command: cloneValue(commandPayload), receivedAt: Date.now() }
              : entry,
          );
        }

        const entry = createCommandLogEntry(commandPayload);
        commandEventIdMapRef.current.set(eventId, entry.id);

        const appended = [...prev, entry];
        if (!limit || appended.length <= limit) {
          return appended;
        }

        const trimmedCount = appended.length - limit;
        const trimmedEntries = appended.slice(0, trimmedCount);
        const nextEntries = appended.slice(trimmedCount);
        trimmedEntries.forEach((trimmed) => {
          for (const [key, value] of commandEventIdMapRef.current.entries()) {
            if (value === trimmed.id) {
              commandEventIdMapRef.current.delete(key);
            }
          }
        });
        return nextEntries;
      });
    },
    [createCommandLogEntry, limit, upsertCommandResult],
  );

  const executeCommandInspectorCommand = useCallback(
    (rest: string) => {
      const currentLog = commandLogSnapshotRef.current;
      if (!currentLog || currentLog.length === 0) {
        appendStatus({ level: 'info', message: 'No commands have been received yet.' });
        setCommandInspector(null);
        return;
      }

      const resolution = resolveCommandInspectorRequest(rest, currentLog.length);
      const panelKey = Date.now();
      setCommandInspector({ requested: resolution.count, token: panelKey });

      if (resolution.warningMessage) {
        appendStatus({ level: 'warn', message: resolution.warningMessage });
      }

      appendStatus({ level: 'info', message: resolution.infoMessage });
    },
    [appendStatus],
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
