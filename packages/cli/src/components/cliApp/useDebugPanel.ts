import { useCallback, useRef, useState } from 'react';

import type { DebugEntry, DebugRuntimeEvent, TimelinePayload } from './types.js';
import { appendWithLimit, formatDebugPayload, summarizeAutoResponseDebug } from './logging.js';

const STREAM_ACTION_FIELD = '__openagentStreamAction';
const STREAM_VALUE_FIELD = '__openagentStreamValue';

type ManagedDebugAction = 'replace' | 'remove';

interface ManagedDebugInstruction {
  action: ManagedDebugAction;
  value?: unknown;
}

function parseManagedDebugPayload(payload: unknown): ManagedDebugInstruction | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  type ManagedPayload = {
    [STREAM_ACTION_FIELD]?: unknown;
    [STREAM_VALUE_FIELD]?: unknown;
  };

  const record = payload as ManagedPayload;
  const action = record[STREAM_ACTION_FIELD];

  if (action === 'remove') {
    return { action: 'remove' };
  }

  if (action === 'replace' || action === 'update') {
    return {
      action: 'replace',
      value: record[STREAM_VALUE_FIELD],
    };
  }

  return null;
}

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
      const managed = parseManagedDebugPayload(event.payload);
      setDebugEvents((prev) => {
        const eventId = event.id;

        if (
          managed?.action === 'remove' &&
          (typeof eventId === 'string' || typeof eventId === 'number')
        ) {
          return prev.filter((existing) => existing.id !== eventId);
        }

        const payloadForEntry = managed ? managed.value : event.payload;
        const entry = createDebugEntry({ ...event, payload: payloadForEntry } as DebugRuntimeEvent);
        if (!entry) {
          return prev;
        }

        if (
          managed?.action === 'replace' &&
          (typeof eventId === 'string' || typeof eventId === 'number')
        ) {
          let replaced = false;
          const next = prev.map((existing) => {
            if (existing.id === entry.id) {
              replaced = true;
              return entry;
            }
            return existing;
          });
          if (replaced) {
            return next;
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
