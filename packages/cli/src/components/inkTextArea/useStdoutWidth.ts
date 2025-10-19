import { useEffect, useMemo, useState } from 'react';
import { useStdout } from 'ink';

export interface UseStdoutWidthOptions {
  horizontalOffset?: number;
}

// Tracks the live terminal width so caret/layout math can stay in a lean hook.
export function useStdoutWidth(explicitWidth?: number, options?: UseStdoutWidthOptions) {
  const { stdout } = useStdout();
  const [measuredWidth, setMeasuredWidth] = useState<number | undefined>(() =>
    stdout && Number.isFinite(stdout.columns) ? Math.floor(stdout.columns) : undefined,
  );
  const rawOffset = options?.horizontalOffset;
  const horizontalOffset =
    typeof rawOffset === 'number' && Number.isFinite(rawOffset) ? Math.max(0, Math.floor(rawOffset)) : 0;

  useEffect(() => {
    if (!stdout) {
      setMeasuredWidth(undefined);
      return undefined;
    }

    const handleResize = () => {
      if (Number.isFinite(stdout.columns)) {
        setMeasuredWidth(Math.floor(stdout.columns));
      } else {
        setMeasuredWidth(undefined);
      }
    };

    handleResize();
    stdout.on('resize', handleResize);

    return () => {
      if (typeof stdout.off === 'function') {
        stdout.off('resize', handleResize);
      } else {
        stdout.removeListener?.('resize', handleResize);
      }
    };
  }, [stdout]);

  const normalizedWidth = useMemo(() => {
    if (typeof explicitWidth === 'number' && Number.isFinite(explicitWidth)) {
      return Math.max(1, Math.floor(explicitWidth));
    }

    if (typeof measuredWidth === 'number') {
      return Math.max(1, Math.floor(measuredWidth) - horizontalOffset);
    }

    return Math.max(1, 60 - horizontalOffset);
  }, [explicitWidth, horizontalOffset, measuredWidth]);

  return { measuredWidth, normalizedWidth } as const;
}

