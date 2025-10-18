import { useEffect, useMemo, useState } from 'react';
import { useStdout } from 'ink';

// Tracks the live terminal width so caret/layout math can stay in a lean hook.
export function useStdoutWidth(explicitWidth?: number) {
  const { stdout } = useStdout();
  const [measuredWidth, setMeasuredWidth] = useState<number | undefined>(() =>
    stdout && Number.isFinite(stdout.columns) ? Math.floor(stdout.columns) : undefined,
  );

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
      return Math.max(1, Math.floor(measuredWidth));
    }

    return 60;
  }, [explicitWidth, measuredWidth]);

  return { measuredWidth, normalizedWidth } as const;
}

