import { useCallback, useRef, useState } from 'react';

import type { DebugEntry, DebugRuntimeEvent, TimelinePayload } from './types.js';
import { resolveDebugPanelUpdate } from './debugPanelManager.js';

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

  const handleDebugEvent = useCallback(
    (event: DebugRuntimeEvent) => {
      let summary: string | null = null;

      setDebugEvents((prev) => {
        const result = resolveDebugPanelUpdate({
          entries: prev,
          event,
          limit,
          idRef: debugEventIdRef,
        });
        summary = result.summary;
        return result.nextEntries;
      });

      if (summary) {
        appendStatus({ level: 'warn', message: summary });
      }
    },
    [appendStatus, limit],
  );

  return { debugEvents, handleDebugEvent };
}
