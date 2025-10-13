import { useCallback, useRef, useState } from 'react';

import type { DebugEntry, DebugRuntimeEvent, TimelinePayload } from './types.js';
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

  const createDebugEntry = useCallback((event: DebugRuntimeEvent): DebugEntry | null => {
    const formatted = formatDebugPayload(event.payload);
    if (!formatted) {
      return null;
    }

    const entryId =
      typeof event.id === 'string' || typeof event.id === 'number'
        ? (event.id as string | number)
        : debugEventIdRef.current + 1;

    if (typeof entryId === 'number') {
      debugEventIdRef.current = entryId;
    } else {
      debugEventIdRef.current += 1;
    }

    return { id: entryId, content: formatted } satisfies DebugEntry;
  }, []);

  const handleDebugEvent = useCallback(
    (event: DebugRuntimeEvent) => {
      setDebugEvents((prev) => {
        const entry = createDebugEntry(event);
        if (!entry) {
          return prev;
        }
        return appendWithLimit(prev, entry, limit).next;
      });

      const summary = summarizeAutoResponseDebug(event.payload);
      if (summary) {
        appendStatus({ level: 'warn', message: summary });
      }
    },
    [appendStatus, createDebugEntry, limit],
  );

  return { debugEvents, handleDebugEvent };
}
