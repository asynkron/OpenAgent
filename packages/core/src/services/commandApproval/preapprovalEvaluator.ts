import * as path from 'node:path';

import { shellSplit } from '../../utils/text.js';
import { findAllowlistEntry, extractSubcommand, validateSubcommand } from './allowlistMatching.js';
import { commandSignature, isCommandStringSafe, validateShellOption } from './commandSafety.js';
import { validateCommandSpecificArgs } from './commandSpecificRules.js';
import type { Command, CommandConfig } from './types.js';

export function buildCommandSignature(command: Command): string {
  return commandSignature(command);
}

export function isCommandPreapproved(command: Command, config: CommandConfig): boolean {
  try {
    const runField = typeof command?.run === 'string' ? command.run : '';
    const trimmedCommand = runField.trim();
    if (!trimmedCommand) {
      return false;
    }

    if (!isCommandStringSafe(trimmedCommand)) {
      return false;
    }

    if (!validateShellOption(command)) {
      return false;
    }

    const tokens = shellSplit(trimmedCommand);
    if (tokens.length === 0) {
      return false;
    }

    const base = path.basename(tokens[0]);
    const allowlistEntry = findAllowlistEntry(base, config);
    if (!allowlistEntry) {
      return false;
    }

    const subcommand = extractSubcommand(tokens);
    if (!validateSubcommand(base, subcommand, allowlistEntry, tokens)) {
      return false;
    }

    if (!validateCommandSpecificArgs(base, tokens)) {
      return false;
    }

    return true;
  } catch (_err) {
    return false;
  }
}
