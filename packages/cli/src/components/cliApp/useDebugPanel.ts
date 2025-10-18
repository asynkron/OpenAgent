import { useCallback, useRef, useState } from 'react';

import type { DebugEntry, DebugRuntimeEvent, TimelinePayload } from './types.js';
import {
  parseManagedDebugPayload,
  removeEntryById,
  replaceEntryById,
  resolveEntryIdentifier,
  shouldRemoveEntry,
  shouldReplaceEntry,
} from './debugPanelHelpers.js';
import { appendWithLimit, formatDebugPayload, summarizeAutoResponseDebug } from './logging.js';

export interface UseDebugPanelOptions {
  limit: number;
  appendStatus: (status: TimelinePayload<'status'>) => void;
}

/**
 * Centralises debug log bookkeeping so CliApp only wires the runtime event handlers.
 */
export function useDebugPanel({ limit, appendStatus }: UseDebugPanelOptions): {
  debugEvents: DebugEntry[];
  handleDebugEvent: (event: DebugRuntimeEvent) => void;
} {
  const debugEventIdRef = useRef(0);
  const [debugEvents, setDebugEvents] = useState<DebugEntry[]>([]);

  const createDebugEntry = useCallback(
    (event: DebugRuntimeEvent): DebugEntry | null => {
      const formatted = formatDebugPayload(event.payload);
      if (!formatted) {
        return null;
      }

      const entryId = resolveEntryIdentifier(event.id, debugEventIdRef);

      return { id: entryId, content: formatted } satisfies DebugEntry;
    },
    [],
  );

  const handleDebugEvent = useCallback(
    (event: DebugRuntimeEvent) => {
      const managed = parseManagedDebugPayload(event.payload);
      const eventId = event.id;

      setDebugEvents((prev) => {
        if (shouldRemoveEntry(managed, eventId)) {
          return removeEntryById(prev, eventId);
        }

        const payloadForEntry = managed ? managed.value : event.payload;
        const entry = createDebugEntry({ ...event, payload: payloadForEntry } as DebugRuntimeEvent);
        if (!entry) {
          return prev;
        }

        if (shouldReplaceEntry(managed, eventId)) {
          const replaced = replaceEntryById(prev, entry);
          if (replaced) {
            return replaced;
          }
        }

        return appendWithLimit(prev, entry, limit).next;
      });

      const summary =
        managed?.action === 'remove' ? null : summarizeAutoResponseDebug(event.payload);
      if (summary) {
        appendStatus({ level: 'warn', message: summary });
      }
    },
    [appendStatus, createDebugEntry, limit],
  );

  return { debugEvents, handleDebugEvent };
}
