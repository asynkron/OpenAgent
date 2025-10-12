// @ts-nocheck
import React, { useMemo } from 'react';
import { Text } from 'ink';

const h = React.createElement;

function formatPercentage(value) {
  if (!Number.isFinite(value)) {
    return null;
  }
  if (value >= 10) {
    return value.toFixed(0);
  }
  return value.toFixed(1);
}

/**
 * Mirrors the legacy context usage status line.
 */
export function ContextUsage({ usage }) {
  const line = useMemo(() => {
    if (!usage || typeof usage !== 'object') {
      return '';
    }

    const { total, used, remaining, percentRemaining } = usage;

    if (!Number.isFinite(total) || total <= 0) {
      return '';
    }

    const safeRemaining = Number.isFinite(remaining) ? Math.max(remaining, 0) : null;
    const safeUsed = Number.isFinite(used) ? Math.max(used, 0) : null;
    const percent = Number.isFinite(percentRemaining)
      ? Math.max(Math.min(percentRemaining, 100), 0)
      : safeRemaining !== null
        ? (safeRemaining / total) * 100
        : null;

    const parts = [
      `Context remaining: ${safeRemaining?.toLocaleString?.() ?? '—'} / ${total.toLocaleString?.() ?? total}`,
    ];

    if (percent !== null) {
      const formatted = formatPercentage(percent);
      if (formatted !== null) {
        parts.push(`(${formatted}% left)`);
      }
    }

    if (safeUsed !== null) {
      parts.push(`• used ≈ ${safeUsed.toLocaleString?.() ?? safeUsed}`);
    }

    return parts.join(' ');
  }, [usage]);

  if (!line) {
    return null;
  }

  return h(Text, { dimColor: true }, line);
}

export default ContextUsage;
