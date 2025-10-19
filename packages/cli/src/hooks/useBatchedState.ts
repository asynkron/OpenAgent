import { useCallback, useEffect, useRef, useState } from 'react';

export interface BatchedStateOptions<T> {
  initial: T;
  flushMs?: number; // default ~100ms
}

// Buffers updates and flushes on a timer to limit render frequency.
export function useBatchedState<T>(options: BatchedStateOptions<T>) {
  const flushMsValue = typeof options.flushMs === 'number' && Number.isFinite(options.flushMs)
    ? Math.max(0, Math.floor(options.flushMs))
    : 100;

  const [value, setValue] = useState<T>(options.initial);
  const nextRef = useRef<T>(options.initial);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setValue(nextRef.current);
  }, []);

  const setBatched = useCallback((next: T) => {
    nextRef.current = next;
    if (!timerRef.current) {
      timerRef.current = setTimeout(flush, flushMsValue);
    }
  }, [flush, flushMsValue]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return { value, setBatched, flush } as const;
}
