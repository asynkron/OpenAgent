import { useCallback, useRef, useState } from 'react';

import type { TimelineEntry, TimelineEntryType, TimelinePayload } from './types.js';
import { appendWithLimit } from './logging.js';

export type AppendTimelineEntry = <Type extends TimelineEntryType>(
  type: Type,
  payload: TimelinePayload<Type>,
) => void;

/**
 * Keeps the timeline entry state isolated so the main CliApp component focuses on routing events.
 */
export function useTimeline(limit: number): {
  entries: TimelineEntry[];
  timelineKey: number;
  appendEntry: AppendTimelineEntry;
} {
  const entryIdRef = useRef(0);
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [timelineKey, setTimelineKey] = useState(0);

  const appendEntry = useCallback<AppendTimelineEntry>(
    (type, payload) => {
      const entry = {
        id: entryIdRef.current + 1,
        type,
        payload,
      } as TimelineEntry;

      entryIdRef.current = entry.id;

      setEntries((prev) => {
        const { next, trimmed } = appendWithLimit(prev, entry, limit);

        if (trimmed) {
          // When the list is trimmed React needs a new key so Ink rerenders the scroller.
          setTimelineKey((value) => value + 1);
        }

        return next;
      });
    },
    [limit],
  );

  return { entries, timelineKey, appendEntry };
}
