import type { CommandAllowlistEntry, CommandConfig } from './types.js';

export function findAllowlistEntry(base: string, cfg: CommandConfig): CommandAllowlistEntry | null {
  const list = Array.isArray(cfg.allowlist) ? cfg.allowlist : [];
  const match = list.find((item) => item?.name === base);
  return match ?? null;
}

export function extractSubcommand(tokens: string[]): string {
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith('-')) {
      return token;
    }
  }
  return '';
}

export function validateSubcommand(
  base: string,
  subcommand: string,
  entry: CommandAllowlistEntry,
  tokens: string[],
): boolean {
  if (!Array.isArray(entry.subcommands) || entry.subcommands.length === 0) {
    return true;
  }

  if (!entry.subcommands.includes(subcommand)) {
    return false;
  }

  if (['python', 'python3', 'pip', 'node', 'npm'].includes(base)) {
    const subcommandIndex = tokens.indexOf(subcommand);
    if (subcommandIndex !== -1 && tokens.length > subcommandIndex + 1) {
      return false;
    }
  }

  return true;
}
