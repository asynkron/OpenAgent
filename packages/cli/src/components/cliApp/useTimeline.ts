import { useCallback, useRef, useState } from 'react';

import type { AppendTimelineEntry, TimelineEntry, TimelineEntryType } from './types.js';
import { appendWithLimit } from './logging.js';

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
    (type: TimelineEntryType, payload: TimelineEntry['payload']) => {
      const id = entryIdRef.current + 1;
      entryIdRef.current = id;

      const entry = { id, type, payload } as TimelineEntry;
      setEntries((previousEntries) => {
        const { next, trimmed } = appendWithLimit(previousEntries, entry, limit);
        if (trimmed) {
          // Incrementing the key forces Ink's <Static> list to rerender after trimming.
          setTimelineKey((value) => value + 1);
        }
        return next;
      });
    },
    [limit],
  );

  return { entries, timelineKey, appendEntry };
}
