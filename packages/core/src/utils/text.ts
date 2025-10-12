// @ts-nocheck
/**
 * Text and shell utility helpers used across the agent runtime.
 *
 * Responsibilities:
 * - Provide regex filtering and truncation helpers for command output.
 * - Offer a minimal shell argument splitter reused by the pre-approval logic.
 *
 * Consumers:
 * - `src/agent/loop.js` uses `applyFilter` and `tailLines` when preparing observations.
 * - `src/services/commandApprovalService.js` depends on `shellSplit` to parse allow-listed commands.
 *
 * Note: The runtime still imports the compiled `text.js`; run `tsc` to regenerate it after editing this source until the build
 * pipeline is fully TypeScript-aware.
 */

export type TruncateOptions = {
  head?: number;
  tail?: number;
  snipMarker?: string;
};

const SHELL_SPLIT_PATTERN = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|\S+/g;

export function applyFilter(text: string, regex?: RegExp | string | null): string {
  if (!regex) return text;
  try {
    const pattern = regex instanceof RegExp ? regex : new RegExp(regex, 'i');
    return text
      .split('\n')
      .filter((line) => pattern.test(line))
      .join('\n');
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error('Invalid regex pattern:', error.message);
    return text;
  }
}

export function tailLines(text: string, lines?: number | null): string {
  if (!lines) return text;
  const allLines = text.split('\n');
  return allLines.slice(-lines).join('\n');
}

export function truncateOutput(
  text: unknown,
  { head = 5000, tail = 5000, snipMarker = '<snip....>' }: TruncateOptions = {},
): string {
  if (text === undefined || text === null) {
    return '';
  }

  const asString = String(text);
  if (asString === '') {
    return '';
  }

  const lines = asString.split('\n');
  const totalLines = lines.length;

  if (totalLines <= head + tail) {
    return asString;
  }

  const tailSlice = tail > 0 ? lines.slice(-tail) : [];
  const headSlice = head > 0 ? lines.slice(0, head) : [];

  const parts: string[] = [];
  if (headSlice.length) {
    parts.push(headSlice.join('\n'));
  }
  parts.push(snipMarker);
  if (tailSlice.length) {
    parts.push(tailSlice.join('\n'));
  }

  return parts.join('\n');
}

export function shellSplit(str: string): string[] {
  SHELL_SPLIT_PATTERN.lastIndex = 0; // reset global regex state between invocations
  const out: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = SHELL_SPLIT_PATTERN.exec(str))) {
    out.push(match[1] ?? match[2] ?? match[0]);
  }
  return out;
}

const textUtils = {
  applyFilter,
  tailLines,
  truncateOutput,
  shellSplit,
};

export default textUtils;
