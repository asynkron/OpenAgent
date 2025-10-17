/**
 * Implements command approval helpers, now grouped behind a dedicated
 * `CommandApprovalService` class. The static helpers remain exported for
 * backwards compatibility with callers that still import individual functions.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';

import type { CommandRequest } from '../contracts/index.js';
import { shellSplit } from '../utils/text.js';

export interface CommandConfig {
  allowlist: Array<{
    name: string;
    subcommands?: string[];
  }>;
}

interface CommandApprovalServiceOptions {
  config?: CommandConfig;
  sessionApprovals?: Set<string>;
}

export class CommandApprovalService {
  private allowlistConfig: CommandConfig;
  private sessionApprovals: Set<string>;

  constructor({ config, sessionApprovals }: CommandApprovalServiceOptions = {}) {
    this.allowlistConfig = config ?? CommandApprovalService.loadPreapprovedConfig();
    this.sessionApprovals = sessionApprovals ?? new Set();
  }

  /**
   * Return the allowlist configuration associated with the instance.
   */
  get config(): CommandConfig {
    return this.allowlistConfig;
  }

  /**
   * Replace the stored allowlist configuration.
   * Useful for tests that want to inject fixtures without mutating globals.
   */
  set config(cfg: CommandConfig | null) {
    this.allowlistConfig = cfg || { allowlist: [] };
  }

  /**
   * Determine whether the provided command is automatically approved.
   */
  isPreapprovedCommand(
    command: CommandRequest | null | undefined,
    cfg: CommandConfig = this.config,
  ): boolean {
    return CommandApprovalService.isPreapprovedCommand(command, cfg);
  }

  /**
   * Whether the command has already been approved during this session.
   */
  isSessionApproved(command: CommandRequest | null | undefined): boolean {
    try {
      return this.sessionApprovals.has(CommandApprovalService.commandSignature(command));
    } catch (_err) {
      return false;
    }
  }

  /**
   * Record the command signature for session-long approvals.
   */
  approveForSession(command: CommandRequest | null | undefined): void {
    try {
      this.sessionApprovals.add(CommandApprovalService.commandSignature(command));
    } catch (_err) {
      // ignore
    }
  }

  /**
   * Reset all stored session approvals.
   */
  resetSessionApprovals(): void {
    this.sessionApprovals.clear();
  }

  /**
   * Load the allowlist configuration from disk.
   */
  static loadPreapprovedConfig(): CommandConfig {
    const cfgPath = path.join(process.cwd(), 'approved_commands.json');
    try {
      if (fs.existsSync(cfgPath)) {
        const raw = fs.readFileSync(cfgPath, 'utf8');
        const parsed = JSON.parse(raw);
        return parsed && parsed.allowlist ? parsed : { allowlist: [] };
      }
    } catch (err) {
      console.error(
        chalk.yellow('Warning: Failed to load approved_commands.json:'),
        (err as Error).message,
      );
    }
    return { allowlist: [] };
  }

  /**
   * Lightweight validation to prevent obviously unsafe shell invocations.
   */
  static isCommandStringSafe(rawCommand: string): boolean {
    if (typeof rawCommand !== 'string') {
      return false;
    }

    const runRaw = rawCommand.trim();
    if (!runRaw) {
      return false;
    }

    if (/\r|\n/.test(runRaw)) {
      return false;
    }

    const forbidden = [
      /;|&&|\|\|/, // chaining commands or logical operators
      /\|/, // piping output into another process
      /`/, // legacy command substitution
      /\$\(/, // modern command substitution
      /<\s*\(/, // process substitution with optional whitespace
      />\s*\(/, // output process substitution
      /(^|[^&])&([^&]|$)/, // background execution with single ampersand
      /<<</, // here-strings
      /<</, // here-documents
      /&>/, // redirecting all output to a file
    ];

    if (forbidden.some((re) => re.test(runRaw))) {
      return false;
    }

    if (/^\s*sudo\b/.test(runRaw)) {
      return false;
    }

    if (/(^|\s)[0-9]*>>?\s/.test(runRaw)) {
      return false;
    }

    if (/\d?>&\d?/.test(runRaw)) {
      return false;
    }

    return true;
  }

  /**
   * Compute a stable signature for storing approvals.
   */
  static commandSignature(cmd: CommandRequest | null | undefined): string {
    const shell = typeof cmd?.shell === 'string' && cmd.shell.trim() ? cmd.shell.trim() : 'bash';
    const run = typeof cmd?.run === 'string' ? cmd.run : '';
    const cwd = typeof cmd?.cwd === 'string' && cmd.cwd.trim() ? cmd.cwd.trim() : '.';

    return JSON.stringify({
      shell,
      run,
      cwd,
    });
  }

  /**
   * Validate shell option for command.
   */
  private static validateShellOption(command: CommandRequest | null | undefined): boolean {
    const shellOpt = command && 'shell' in command ? command?.shell : undefined;
    if (typeof shellOpt === 'string') {
      const normalized = String(shellOpt).trim().toLowerCase();
      return ['bash', 'sh'].includes(normalized);
    }
    return true;
  }

  /**
   * Find allowlist entry for command base name.
   */
  private static findAllowlistEntry(
    base: string,
    cfg: CommandConfig,
  ): { name: string; subcommands?: string[] } | null {
    const list = cfg && Array.isArray(cfg.allowlist) ? cfg.allowlist : [];
    return list.find((item) => item && item.name === base) || null;
  }

  /**
   * Extract subcommand from tokens.
   */
  private static extractSubcommand(tokens: string[]): string {
    for (let i = 1; i < tokens.length; i++) {
      const token = tokens[i];
      if (!token.startsWith('-')) {
        return token;
      }
    }
    return '';
  }

  /**
   * Validate subcommand for specific commands.
   */
  private static validateSubcommand(
    base: string,
    sub: string,
    entry: { subcommands?: string[] },
    tokens: string[],
  ): boolean {
    if (!Array.isArray(entry.subcommands) || entry.subcommands.length === 0) {
      return true;
    }

    if (!entry.subcommands.includes(sub)) {
      return false;
    }

    if (['python', 'python3', 'pip', 'node', 'npm'].includes(base)) {
      const afterIdx = tokens.indexOf(sub);
      return !(afterIdx !== -1 && tokens.length > afterIdx + 1);
    }

    return true;
  }

  /**
   * Validate sed command arguments.
   */
  private static validateSedCommand(joined: string): boolean {
    return !/(^|\s)-i(\b|\s)/.test(joined);
  }

  /**
   * Validate find command arguments.
   */
  private static validateFindCommand(joined: string): boolean {
    return !(/\s-exec\b/.test(joined) || /\s-delete\b/.test(joined));
  }

  /**
   * Validate curl command arguments.
   */
  private static validateCurlCommand(joined: string, tokens: string[]): boolean {
    if (/(^|\s)-X\s*(POST|PUT|PATCH|DELETE)\b/i.test(joined)) return false;
    if (/(^|\s)(--data(-binary|-raw|-urlencode)?|-d|--form|-F|--upload-file|-T)\b/i.test(joined))
      return false;
    if (/(^|\s)(-O|--remote-name|--remote-header-name)\b/.test(joined)) return false;

    const tokensAfterBase = tokens.slice(1);
    for (let i = 0; i < tokensAfterBase.length; i++) {
      const token = tokensAfterBase[i];
      if (token === '-o' || token === '--output') {
        const name = tokensAfterBase[i + 1] || '';
        if (name !== '-') return false;
      }
      if (token.startsWith('-o') && token.length > 2) return false;
    }

    return true;
  }

  /**
   * Validate wget command arguments.
   */
  private static validateWgetCommand(joined: string, tokens: string[]): boolean {
    if (/\s--spider\b/.test(joined)) {
      return true; // allowed
    }

    const tokensAfterBase = tokens.slice(1);
    for (let i = 0; i < tokensAfterBase.length; i++) {
      const token = tokensAfterBase[i];
      if (token === '-O' || token === '--output-document') {
        const name = tokensAfterBase[i + 1] || '';
        if (name !== '-') return false;
      }
      if (token.startsWith('-O') && token !== '-O') return false;
    }

    return true;
  }

  /**
   * Validate ping command arguments.
   */
  private static validatePingCommand(tokens: string[]): boolean {
    const idx = tokens.indexOf('-c');
    if (idx === -1) return false;
    const count = parseInt(tokens[idx + 1], 10);
    return Number.isFinite(count) && count <= 3 && count >= 1;
  }

  /**
   * Validate command-specific arguments.
   */
  private static validateCommandSpecificArgs(base: string, tokens: string[]): boolean {
    const joined = ' ' + tokens.slice(1).join(' ') + ' ';

    switch (base) {
      case 'sed':
        return CommandApprovalService.validateSedCommand(joined);
      case 'find':
        return CommandApprovalService.validateFindCommand(joined);
      case 'curl':
        return CommandApprovalService.validateCurlCommand(joined, tokens);
      case 'wget':
        return CommandApprovalService.validateWgetCommand(joined, tokens);
      case 'ping':
        return CommandApprovalService.validatePingCommand(tokens);
      default:
        return true;
    }
  }

  /**
   * Core allowlist evaluation shared by the instance and the static export.
   */
  static isPreapprovedCommand(
    command: CommandRequest | null | undefined,
    cfg: CommandConfig,
  ): boolean {
    try {
      const runRaw = (command && command.run ? String(command.run) : '').trim();
      if (!runRaw) return false;

      if (!CommandApprovalService.isCommandStringSafe(runRaw)) return false;
      if (!CommandApprovalService.validateShellOption(command)) return false;

      const tokens = shellSplit(runRaw);
      if (!tokens.length) return false;
      const base = path.basename(tokens[0]);

      const entry = CommandApprovalService.findAllowlistEntry(base, cfg);
      if (!entry) return false;

      const sub = CommandApprovalService.extractSubcommand(tokens);
      if (!CommandApprovalService.validateSubcommand(base, sub, entry, tokens)) return false;
      if (!CommandApprovalService.validateCommandSpecificArgs(base, tokens)) return false;

      return true;
    } catch (_err) {
      return false;
    }
  }
}

const defaultCommandApprovalService = new CommandApprovalService();

export const loadPreapprovedConfig = CommandApprovalService.loadPreapprovedConfig;
export const isCommandStringSafe = CommandApprovalService.isCommandStringSafe;
export const commandSignature = CommandApprovalService.commandSignature;

export function isPreapprovedCommand(
  command: CommandRequest | null | undefined,
  cfg: CommandConfig = defaultCommandApprovalService.config,
): boolean {
  return CommandApprovalService.isPreapprovedCommand(command, cfg);
}

export function isSessionApproved(cmd: CommandRequest | null | undefined): boolean {
  return defaultCommandApprovalService.isSessionApproved(cmd);
}

export function approveForSession(cmd: CommandRequest | null | undefined): void {
  return defaultCommandApprovalService.approveForSession(cmd);
}

export function resetSessionApprovals(): void {
  defaultCommandApprovalService.resetSessionApprovals();
}

export const PREAPPROVED_CFG = defaultCommandApprovalService.config;

export const sessionApprovalService = defaultCommandApprovalService;

export default {
  CommandApprovalService,
  sessionApprovalService,
  loadPreapprovedConfig,
  isPreapprovedCommand,
  isSessionApproved,
  approveForSession,
  resetSessionApprovals,
  commandSignature,
  PREAPPROVED_CFG,
  isCommandStringSafe,
};
