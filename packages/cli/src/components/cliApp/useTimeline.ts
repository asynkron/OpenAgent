import { useCallback, useRef, useState } from 'react';

import type {
  AppendTimelineEntry,
  TimelineAssistantPayload,
  TimelineCommandPayload,
  TimelineEntry,
  TimelineEntryType,
  UpsertAssistantTimelineEntry,
  UpsertCommandTimelineEntry,
} from './types.js';

interface AppendResult {
  readonly next: TimelineEntry[];
  readonly trimmedEntries: TimelineEntry[];
}

const applyLimit = (
  previous: TimelineEntry[],
  entry: TimelineEntry,
  limit: number,
): AppendResult => {
  const appended = [...previous, entry];
  if (!limit || appended.length <= limit) {
    return { next: appended, trimmedEntries: [] } satisfies AppendResult;
  }

  const trimmedCount = appended.length - limit;
  return {
    next: appended.slice(trimmedCount),
    trimmedEntries: appended.slice(0, trimmedCount),
  } satisfies AppendResult;
};

const areAssistantPayloadsEqual = (
  current: TimelineAssistantPayload,
  next: TimelineAssistantPayload,
): boolean => current.eventId === next.eventId && current.message === next.message;

const areCommandPayloadsEqual = (
  current: TimelineCommandPayload,
  next: TimelineCommandPayload,
): boolean =>
  current.eventId === next.eventId &&
  current.command === next.command &&
  current.result === next.result &&
  current.preview === next.preview &&
  current.execution === next.execution &&
  current.observation === next.observation &&
  current.planStep === next.planStep;

const findEntryIndexById = (entries: TimelineEntry[], id: number): number => {
  for (let index = 0; index < entries.length; index += 1) {
    if (entries[index]?.id === id) {
      return index;
    }
  }
  return -1;
};

export function useTimeline(limit: number): {
  entries: TimelineEntry[];
  timelineKey: number;
  appendEntry: AppendTimelineEntry;
  upsertAssistantEntry: UpsertAssistantTimelineEntry;
  upsertCommandEntry: UpsertCommandTimelineEntry;
} {
  const entryIdRef = useRef(0);
  const eventIdMapRef = useRef<Map<string, number>>(new Map());
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [timelineKey, setTimelineKey] = useState(0);

  const removeEventMappingForEntry = useCallback((entry: TimelineEntry): void => {
    if (entry.type === 'assistant-message') {
      eventIdMapRef.current.delete(entry.payload.eventId);
      return;
    }
    if (entry.type === 'command-result') {
      eventIdMapRef.current.delete(entry.payload.eventId);
    }
  }, []);

  const appendEntry = useCallback<AppendTimelineEntry>(
    (type: TimelineEntryType, payload: TimelineEntry['payload']) => {
      const id = entryIdRef.current + 1;
      entryIdRef.current = id;

      const entry = { id, type, payload } as TimelineEntry;
      setEntries((previousEntries) => {
        const { next, trimmedEntries } = applyLimit(previousEntries, entry, limit);
        if (trimmedEntries.length > 0) {
          trimmedEntries.forEach((trimmed) => removeEventMappingForEntry(trimmed));
          setTimelineKey((value) => value + 1);
        }
        return next;
      });
    },
    [limit, removeEventMappingForEntry],
  );

  const upsertAssistantEntry = useCallback<UpsertAssistantTimelineEntry>(
    (payload: TimelineAssistantPayload) => {
      const eventId = payload.eventId;
      if (!eventId) {
        appendEntry('assistant-message', payload);
        return;
      }

      setEntries((previousEntries) => {
        const existingId = eventIdMapRef.current.get(eventId);
        if (existingId) {
          const index = findEntryIndexById(previousEntries, existingId);
          if (index === -1) {
            return previousEntries;
          }

          const currentEntry = previousEntries[index];
          if (currentEntry.type !== 'assistant-message') {
            return previousEntries;
          }

          if (areAssistantPayloadsEqual(currentEntry.payload, payload)) {
            return previousEntries;
          }

          const nextEntries = previousEntries.slice();
          nextEntries[index] = { ...currentEntry, payload } as TimelineEntry;
          return nextEntries;
        }

        const id = entryIdRef.current + 1;
        entryIdRef.current = id;
        const entry: TimelineEntry = { id, type: 'assistant-message', payload };
        const { next, trimmedEntries } = applyLimit(previousEntries, entry, limit);
        eventIdMapRef.current.set(eventId, id);
        if (trimmedEntries.length > 0) {
          trimmedEntries.forEach((trimmed) => removeEventMappingForEntry(trimmed));
          setTimelineKey((value) => value + 1);
        }
        return next;
      });
    },
    [appendEntry, limit, removeEventMappingForEntry],
  );

  const upsertCommandEntry = useCallback<UpsertCommandTimelineEntry>(
    (payload: TimelineCommandPayload) => {
      const eventId = payload.eventId;
      setEntries((previousEntries) => {
        const existingId = eventIdMapRef.current.get(eventId);
        if (existingId) {
          const index = findEntryIndexById(previousEntries, existingId);
          if (index === -1) {
            return previousEntries;
          }

          const currentEntry = previousEntries[index];
          if (currentEntry.type !== 'command-result') {
            return previousEntries;
          }

          if (areCommandPayloadsEqual(currentEntry.payload, payload)) {
            return previousEntries;
          }

          const nextEntries = previousEntries.slice();
          nextEntries[index] = { ...currentEntry, payload } as TimelineEntry;
          return nextEntries;
        }

        const id = entryIdRef.current + 1;
        entryIdRef.current = id;
        const entry: TimelineEntry = { id, type: 'command-result', payload };
        const { next, trimmedEntries } = applyLimit(previousEntries, entry, limit);
        eventIdMapRef.current.set(eventId, id);
        if (trimmedEntries.length > 0) {
          trimmedEntries.forEach((trimmed) => removeEventMappingForEntry(trimmed));
          setTimelineKey((value) => value + 1);
        }
        return next;
      });
    },
    [limit, removeEventMappingForEntry],
  );

  return { entries, timelineKey, appendEntry, upsertAssistantEntry, upsertCommandEntry };
}

export type { AppendResult };
