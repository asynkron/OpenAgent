import React, { useMemo } from 'react';
import { Text } from 'ink';

import type { ContextUsage as ContextUsageValue } from '../status.js';

const h = React.createElement;

function formatPercentage(value: number | null): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  if (value >= 10) {
    return value.toFixed(0);
  }
  return value.toFixed(1);
}

type ContextUsageProps = {
  usage?: ContextUsageValue | null;
};

/**
 * Mirrors the legacy context usage status line.
 */
export function ContextUsage({ usage }: ContextUsageProps): React.ReactElement | null {
  const line = useMemo(() => {
    if (!usage || typeof usage !== 'object') {
      return '';
    }

    const { total, used, remaining, percentRemaining } = usage;

    if (typeof total !== 'number' || !Number.isFinite(total) || total <= 0) {
      return '';
    }

    const safeRemaining =
      typeof remaining === 'number' && Number.isFinite(remaining) ? Math.max(remaining, 0) : null;
    const safeUsed =
      typeof used === 'number' && Number.isFinite(used) ? Math.max(used, 0) : null;
    const percent =
      typeof percentRemaining === 'number' && Number.isFinite(percentRemaining)
        ? Math.max(Math.min(percentRemaining, 100), 0)
        : safeRemaining !== null
          ? (safeRemaining / total) * 100
          : null;

    const parts = [
      `Context remaining: ${
        safeRemaining !== null ? safeRemaining.toLocaleString() : '—'
      } / ${total.toLocaleString()}`,
    ];

    if (percent !== null) {
      const formatted = formatPercentage(percent);
      if (formatted !== null) {
        parts.push(`(${formatted}% left)`);
      }
    }

    if (safeUsed !== null) {
      parts.push(`• used ≈ ${safeUsed.toLocaleString()}`);
    }

    return parts.join(' ');
  }, [usage]);

  if (!line) {
    return null;
  }

  return h(Text, { dimColor: true }, line) as React.ReactElement;
}

export default ContextUsage;
