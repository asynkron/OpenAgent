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
      const id = entryIdRef.current + 1;
      entryIdRef.current = id;

      let trimmed = false;
      const entry = { id, type, payload } as TimelineEntry;
      setEntries((prev) => {
        const { next, trimmed: wasTrimmed } = appendWithLimit(prev, entry, limit);
        trimmed = wasTrimmed;
        return next;
      });

      if (trimmed) {
        setTimelineKey((value) => value + 1);
      }
    },
    [limit],
  );

  return { entries, timelineKey, appendEntry };
}
