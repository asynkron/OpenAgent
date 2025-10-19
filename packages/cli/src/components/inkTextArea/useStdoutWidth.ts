import { useEffect, useMemo, useRef, useState } from 'react';
import { useStdout } from 'ink';

export interface UseStdoutWidthOptions {
  horizontalOffset?: number;
  debounceMs?: number; // default ~120ms
}

type InkStdout = NodeJS.WriteStream & {
  columns?: number;
  off?: (event: 'resize', handler: () => void) => void;
  removeListener?: (event: 'resize', handler: () => void) => void;
};

// Tracks the live terminal width so caret/layout math can stay in a lean hook.
export function useStdoutWidth(
  explicitWidth?: number,
  options?: UseStdoutWidthOptions,
) {
  const { stdout } = useStdout();
  const s = stdout as InkStdout | undefined;

  const [measuredWidth, setMeasuredWidth] = useState<number | undefined>(() =>
    s && Number.isFinite(s.columns) ? Math.floor(s.columns as number) : undefined,
  );

  const rawOffset = options?.horizontalOffset;
  const horizontalOffset =
    typeof rawOffset === 'number' && Number.isFinite(rawOffset)
      ? Math.max(0, Math.floor(rawOffset))
      : 0;

  const rawDebounce = options?.debounceMs;
  const debounceMs =
    typeof rawDebounce === 'number' && Number.isFinite(rawDebounce)
      ? Math.max(0, Math.floor(rawDebounce))
      : 120; // ~8 FPS default

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!s) {
      setMeasuredWidth(undefined);
      return undefined;
    }

    const applyResize = (): void => {
      if (Number.isFinite(s.columns)) {
        setMeasuredWidth(Math.floor(s.columns as number));
      } else {
        setMeasuredWidth(undefined);
      }
    };

    const handleResize = (): void => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (debounceMs === 0) {
        applyResize();
        return;
      }
      timerRef.current = setTimeout(applyResize, debounceMs);
    };

    // Initialize once immediately (no debounce) to avoid blank first frame.
    applyResize();

    s.on('resize', handleResize);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (typeof s.off === 'function') {
        s.off('resize', handleResize);
      } else {
        s.removeListener?.('resize', handleResize);
      }
    };
  }, [s, debounceMs]);

  const normalizedWidth = useMemo<number>(() => {
    if (typeof explicitWidth === 'number' && Number.isFinite(explicitWidth)) {
      return Math.max(1, Math.floor(explicitWidth));
    }

    if (typeof measuredWidth === 'number' && Number.isFinite(measuredWidth)) {
      return Math.max(1, Math.floor(measuredWidth) - horizontalOffset);
    }

    return Math.max(1, 60 - horizontalOffset);
  }, [explicitWidth, horizontalOffset, measuredWidth]);

  return { measuredWidth, normalizedWidth } as const;
}
