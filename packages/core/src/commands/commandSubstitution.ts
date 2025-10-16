import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const APPLY_PATCH_SCRIPT = resolve(
  fileURLToPath(new URL('../../scripts/apply_patch.mjs', import.meta.url)),
);
const READ_SCRIPT = resolve(fileURLToPath(new URL('../../scripts/read.mjs', import.meta.url)));
const APPLY_PATCH_COMMAND = `node ${JSON.stringify(APPLY_PATCH_SCRIPT)}`;
const READ_COMMAND = `node ${JSON.stringify(READ_SCRIPT)}`;

export const substituteBuiltinCommand = (command: unknown): string => {
  if (typeof command !== 'string') {
    return command as string;
  }

  const leadingWhitespaceMatch = command.match(/^\s*/);
  const leadingWhitespace = leadingWhitespaceMatch ? leadingWhitespaceMatch[0] : '';
  const trimmed = command.slice(leadingWhitespace.length);

  if (/^apply_patch(?=\s|$)/.test(trimmed)) {
    return `${leadingWhitespace}${trimmed.replace(/^apply_patch\b/, APPLY_PATCH_COMMAND)}`;
  }

  if (/^read(?=\s|$)/.test(trimmed)) {
    return `${leadingWhitespace}${trimmed.replace(/^read\b/, READ_COMMAND)}`;
  }

  return command;
};
