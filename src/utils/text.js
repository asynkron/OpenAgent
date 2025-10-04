"use strict";

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

function applyFilter(text, regex) {
  if (!regex) return text;
  try {
    const pattern = new RegExp(regex, 'i');
    return text
      .split('\n')
      .filter((line) => pattern.test(line))
      .join('\n');
  } catch (err) {
    console.error('Invalid regex pattern:', err.message);
    return text;
  }
}

function tailLines(text, lines) {
  if (!lines) return text;
  const allLines = text.split('\n');
  return allLines.slice(-lines).join('\n');
}

function shellSplit(str) {
  const re = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|\S+/g;
  const out = [];
  let match;
  while ((match = re.exec(str))) {
    out.push(match[1] ?? match[2] ?? match[0]);
  }
  return out;
}

module.exports = {
  applyFilter,
  tailLines,
  shellSplit,
};
