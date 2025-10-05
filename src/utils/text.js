/**
 * Text and shell utility helpers used across the agent runtime.
 *
 * Responsibilities:
 * - Provide regex filtering and truncation helpers for command output.
 * - Offer a minimal shell argument splitter reused by the pre-approval logic.
 *
 * Consumers:
 * - `src/agent/loop.js` uses `applyFilter` and `tailLines` when preparing observations.
 * - `src/commands/preapproval.js` depends on `shellSplit` to parse allow-listed commands.
 */

export function applyFilter(text, regex) {
  if (!regex) return text;
  try {
    const pattern = regex instanceof RegExp ? regex : new RegExp(regex, 'i');
    return text
      .split('\n')
      .filter((line) => pattern.test(line))
      .join('\n');
  } catch (err) {
    console.error('Invalid regex pattern:', err.message);
    return text;
  }
}

export function tailLines(text, lines) {
  if (!lines) return text;
  const allLines = text.split('\n');
  return allLines.slice(-lines).join('\n');
}

export function truncateOutput(text, { head = 200, tail = 200, snipMarker = '<snip....>' } = {}) {
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

  const parts = [];
  if (headSlice.length) {
    parts.push(headSlice.join('\n'));
  }
  parts.push(snipMarker);
  if (tailSlice.length) {
    parts.push(tailSlice.join('\n'));
  }

  return parts.join('\n');
}

export function shellSplit(str) {
  const re = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|\S+/g;
  const out = [];
  let match;
  while ((match = re.exec(str))) {
    out.push(match[1] ?? match[2] ?? match[0]);
  }
  return out;
}

export default {
  applyFilter,
  tailLines,
  truncateOutput,
  shellSplit,
};
