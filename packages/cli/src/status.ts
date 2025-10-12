/**
 * Lightweight helpers for rendering transient status lines in the CLI.
 */

import chalk from 'chalk';

type ContextUsage = {
  total: number;
  used?: number | null;
  remaining?: number | null;
  percentRemaining?: number | null;
};

type RenderOptions = {
  logger?: (line: string) => void;
};

function formatPercentage(value: number): string | null {
  if (!Number.isFinite(value)) {
    return null;
  }
  if (value >= 10) {
    return value.toFixed(0);
  }
  return value.toFixed(1);
}

export function renderRemainingContext(
  usage: ContextUsage | null | undefined,
  options: RenderOptions = {},
): string | undefined {
  if (!usage || typeof usage !== 'object') {
    return undefined;
  }

  const { total, used, remaining, percentRemaining } = usage;

  if (!Number.isFinite(total) || total <= 0) {
    return undefined;
  }

  const safeRemaining = Number.isFinite(remaining) ? Math.max(remaining, 0) : null;
  const safeUsed = Number.isFinite(used) ? Math.max(used, 0) : null;
  const percent = Number.isFinite(percentRemaining)
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

  const line = chalk.dim(parts.join(' '));

  const { logger } = options;
  if (typeof logger === 'function') {
    logger(line);
  }

  return line;
}

export default {
  renderRemainingContext,
};
