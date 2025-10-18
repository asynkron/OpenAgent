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

  const createDebugEntry = useCallback(
    (event: DebugRuntimeEvent, payload: unknown = event.payload): DebugEntry | null => {
      const formatted = formatDebugPayload(payload);
      if (!formatted) {
        return null;
      }

      // Reuse runtime-supplied identifiers when present so follow-up instructions can target them.
      const stableId =
        typeof event.id === 'string' || typeof event.id === 'number' ? event.id : null;
      const entryId = stableId ?? debugEventIdRef.current + 1;

      if (typeof entryId === 'number') {
        debugEventIdRef.current = entryId;
      } else {
        debugEventIdRef.current += 1;
      }

      return { id: entryId, content: formatted } satisfies DebugEntry;
    },
    [],
  );

  const handleDebugEvent = useCallback(
    (event: DebugRuntimeEvent) => {
      const instruction = parseManagedDebugPayload(event.payload);
      const stableId =
        typeof event.id === 'string' || typeof event.id === 'number' ? event.id : null;
      const payloadForEntry = instruction ? instruction.value : event.payload;

      setDebugEvents((previous) => {
        if (instruction?.action === 'remove' && stableId !== null) {
          return previous.filter((existing) => existing.id !== stableId);
        }

        const entry = createDebugEntry(event, payloadForEntry);
        if (!entry) {
          return previous;
        }

        if (instruction?.action === 'replace' && stableId !== null) {
          const index = previous.findIndex((existing) => existing.id === entry.id);
          if (index >= 0) {
            const next = previous.slice();
            next[index] = entry;
            return next;
          }
        }

        return appendWithLimit(previous, entry, limit).next;
      });

      const summary =
        instruction?.action === 'remove' ? null : summarizeAutoResponseDebug(event.payload);
      if (summary) {
        appendStatus({ level: 'warn', message: summary });
      }
    },
    [appendStatus, createDebugEntry, limit],
  );

  return { debugEvents, handleDebugEvent };
}
