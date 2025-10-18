import type { Command } from './types.js';

const COMMAND_CHAIN_PATTERNS: RegExp[] = [
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

const REDIRECT_WITH_COUNT = /(^|\s)[0-9]*>>?\s/;
const FD_DUPLICATION = /\d?>&\d?/;
const SUDO_PREFIX = /^\s*sudo\b/;
const NEWLINE_PATTERN = /\r|\n/;

export function isCommandStringSafe(rawCommand: string): boolean {
  if (typeof rawCommand !== 'string') {
    return false;
  }

  const trimmed = rawCommand.trim();
  if (!trimmed) {
    return false;
  }

  if (NEWLINE_PATTERN.test(trimmed)) {
    return false;
  }

  if (COMMAND_CHAIN_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return false;
  }

  if (SUDO_PREFIX.test(trimmed)) {
    return false;
  }

  if (REDIRECT_WITH_COUNT.test(trimmed)) {
    return false;
  }

  if (FD_DUPLICATION.test(trimmed)) {
    return false;
  }

  return true;
}

export function commandSignature(cmd: Command): string {
  return JSON.stringify({
    shell: cmd?.shell ?? 'bash',
    run: typeof cmd?.run === 'string' ? cmd.run : '',
    cwd: cmd?.cwd ?? '.',
  });
}

export function validateShellOption(command: Command): boolean {
  const shellOpt = command && 'shell' in command ? command.shell : undefined;
  if (typeof shellOpt !== 'string') {
    return true;
  }

  const normalized = shellOpt.trim().toLowerCase();
  return normalized === 'bash' || normalized === 'sh';
}
