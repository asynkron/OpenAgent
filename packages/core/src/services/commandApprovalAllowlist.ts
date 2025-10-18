import type { AllowlistEntry, CommandConfig } from './commandApprovalTypes.js';

const REQUIRES_EMPTY_TAIL = ['python', 'python3', 'pip', 'node', 'npm'];

export function findAllowlistEntry(base: string, cfg: CommandConfig): AllowlistEntry | null {
  const candidate = (cfg as { allowlist?: AllowlistEntry[] }).allowlist;
  if (!Array.isArray(candidate)) {
    return null;
  }

  for (const entry of candidate) {
    if (entry && entry.name === base) {
      return entry;
    }
  }

  return null;
}

export function isSubcommandAllowed(
  base: string,
  tokens: string[],
  entry: AllowlistEntry,
): boolean {
  if (!Array.isArray(entry.subcommands) || entry.subcommands.length === 0) {
    return true;
  }

  const subcommand = extractSubcommand(tokens);
  if (!entry.subcommands.includes(subcommand)) {
    return false;
  }

  if (REQUIRES_EMPTY_TAIL.includes(base)) {
    const index = tokens.indexOf(subcommand);
    if (index !== -1 && tokens.length > index + 1) {
      return false;
    }
  }

  return true;
}

function extractSubcommand(tokens: string[]): string {
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith('-')) {
      return token;
    }
  }
  return '';
}
