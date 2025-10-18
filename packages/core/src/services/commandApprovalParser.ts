import * as path from 'node:path';

import { shellSplit } from '../utils/text.js';

import type { Command } from './commandApprovalTypes.js';

export interface ParsedCommand {
  readonly base: string;
  readonly tokens: string[];
}

const FORBIDDEN_PATTERNS: RegExp[] = [
  /;|&&|\|\|/,
  /\|/,
  /`/,
  /\$\(/,
  /<\s*\(/,
  />\s*\(/,
  /(^|[^&])&([^&]|$)/,
  /<</,
  /<<</,
  /&>/,
];

const ALLOWED_SHELLS = ['bash', 'sh'];

export function isCommandStringSafe(rawCommand: string): boolean {
  if (typeof rawCommand !== 'string') {
    return false;
  }

  const trimmed = rawCommand.trim();
  if (trimmed.length === 0) {
    return false;
  }

  if (/\r|\n/.test(trimmed)) {
    return false;
  }

  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(trimmed)) {
      return false;
    }
  }

  if (/^\s*sudo\b/.test(trimmed)) {
    return false;
  }

  if (/(^|\s)[0-9]*>>?\s/.test(trimmed)) {
    return false;
  }

  if (/\d?>&\d?/.test(trimmed)) {
    return false;
  }

  return true;
}

export function parseCommandForApproval(command: Command): ParsedCommand | null {
  const runValue = typeof command.run === 'string' ? command.run.trim() : '';
  if (runValue.length === 0) {
    return null;
  }

  if (!isCommandStringSafe(runValue)) {
    return null;
  }

  if (!validateShellOption(command)) {
    return null;
  }

  try {
    const tokens = shellSplit(runValue);
    if (tokens.length === 0) {
      return null;
    }

    const baseToken = path.basename(tokens[0]);
    if (baseToken.length === 0) {
      return null;
    }

    return { base: baseToken, tokens };
  } catch (_error) {
    return null;
  }
}

function validateShellOption(command: Command): boolean {
  if (typeof command.shell !== 'string') {
    return true;
  }

  const normalized = command.shell.trim().toLowerCase();
  for (const allowed of ALLOWED_SHELLS) {
    if (normalized === allowed) {
      return true;
    }
  }
  return false;
}
