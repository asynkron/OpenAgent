import { useCallback, useRef, useState } from 'react';

import type { DebugEntry, DebugRuntimeEvent, RuntimeProperty, TimelinePayload } from './types.js';
import { appendWithLimit, formatDebugPayload, summarizeAutoResponseDebug } from './logging.js';

const STREAM_ACTION_FIELD = '__openagentStreamAction';
const STREAM_VALUE_FIELD = '__openagentStreamValue';

type ManagedDebugAction = 'replace' | 'remove';

interface ManagedDebugInstruction {
  action: ManagedDebugAction;
  value?: RuntimeProperty;
}

interface ManagedPayloadRecord {
  [STREAM_ACTION_FIELD]?: ManagedDebugAction | 'update';
  [STREAM_VALUE_FIELD]?: RuntimeProperty;
}

function parseManagedDebugPayload(payload: unknown): ManagedDebugInstruction | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const record = payload as ManagedPayloadRecord;
  const action = record[STREAM_ACTION_FIELD];

  if (action === 'remove') {
    return { action: 'remove' } satisfies ManagedDebugInstruction;
  }

  if (action === 'replace' || action === 'update') {
    return {
      action: 'replace',
      value: record[STREAM_VALUE_FIELD],
    } satisfies ManagedDebugInstruction;
  }

  return null;
}

function isStableDebugIdentifier(value: unknown): value is string | number {
  return typeof value === 'string' || typeof value === 'number';
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
      const instruction = parseManagedDebugPayload(event.payload);
      const stableIdentifier = isStableDebugIdentifier(event.id) ? event.id : null;

      if (instruction?.action === 'remove' && stableIdentifier !== null) {
        setDebugEvents((previous) => previous.filter((existing) => existing.id !== stableIdentifier));
        return;
      }

      const payloadForEntry = instruction ? instruction.value : event.payload;
      const entry = createDebugEntry({ ...event, payload: payloadForEntry });
      if (entry) {
        setDebugEvents((previous) => {
          if (instruction?.action === 'replace' && stableIdentifier !== null) {
            let replaced = false;
            const next = previous.map((existing) => {
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

          return appendWithLimit(previous, entry, limit).next;
        });
      }

      const summary = instruction?.action === 'remove'
        ? null
        : summarizeAutoResponseDebug(event.payload);
      if (summary) {
        appendStatus({ level: 'warn', message: summary });
      }
    },
    [appendStatus, createDebugEntry, limit],
  );

  return { debugEvents, handleDebugEvent };
}
