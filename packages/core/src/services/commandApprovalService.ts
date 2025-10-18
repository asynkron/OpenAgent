/**
 * Implements command approval helpers, now grouped behind a dedicated
 * `CommandApprovalService` class. The static helpers remain exported for
 * backwards compatibility with callers that still import individual functions.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';

import { shellSplit } from '../utils/text.js';
import {
  isCommandStringSafe as evaluateCommandSafety,
  validateCommandSpecificArgs as validateCommandTokens,
} from './commandApprovalRules.js';

export type CommandAllowlistEntry = {
  name: string;
  subcommands?: string[];
};

export type CommandConfig = {
  allowlist: CommandAllowlistEntry[];
};

function createEmptyAllowlistConfig(): CommandConfig {
  return { allowlist: [] };
}

export interface Command {
  run?: string;
  shell?: string;
  cwd?: string;
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
    this.allowlistConfig = cfg || createEmptyAllowlistConfig();
  }

  /**
   * Determine whether the provided command is automatically approved.
   */
  isPreapprovedCommand(command: Command, cfg: CommandConfig = this.config): boolean {
    return CommandApprovalService.isPreapprovedCommand(command, cfg);
  }

  /**
   * Whether the command has already been approved during this session.
   */
  isSessionApproved(command: Command): boolean {
    try {
      return this.sessionApprovals.has(CommandApprovalService.commandSignature(command));
    } catch (_err) {
      return false;
    }
  }

  /**
   * Record the command signature for session-long approvals.
   */
  approveForSession(command: Command): void {
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
        return parsed && parsed.allowlist ? parsed : createEmptyAllowlistConfig();
      }
    } catch (err) {
      console.error(
        chalk.yellow('Warning: Failed to load approved_commands.json:'),
        (err as Error).message,
      );
    }
    return createEmptyAllowlistConfig();
  }

  /**
   * Lightweight validation to prevent obviously unsafe shell invocations.
   */
  static isCommandStringSafe(rawCommand: string): boolean {
    return evaluateCommandSafety(rawCommand);
  }

  /**
   * Compute a stable signature for storing approvals.
   */
  static commandSignature(cmd: Command): string {
    return JSON.stringify({
      shell: cmd?.shell || 'bash',
      run: typeof cmd?.run === 'string' ? cmd.run : '',
      cwd: cmd?.cwd || '.',
    });
  }

  /**
   * Validate shell option for command.
   */
  private static validateShellOption(command: Command): boolean {
    const shellOpt = command && 'shell' in command ? command.shell : undefined;
    if (typeof shellOpt === 'string') {
      const normalized = String(shellOpt).trim().toLowerCase();
      return ['bash', 'sh'].includes(normalized);
    }
    return true;
  }

  /**
   * Find allowlist entry for command base name.
   */
  private static findAllowlistEntry(base: string, cfg: CommandConfig): CommandAllowlistEntry | null {
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
    entry: CommandAllowlistEntry,
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
   * Core allowlist evaluation shared by the instance and the static export.
   */
  static isPreapprovedCommand(command: Command, cfg: CommandConfig): boolean {
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
      if (!validateCommandTokens(base, tokens)) return false;

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
  command: unknown,
  cfg: unknown = defaultCommandApprovalService.config,
): boolean {
  return CommandApprovalService.isPreapprovedCommand(command as Command, cfg as CommandConfig);
}

export function isSessionApproved(cmd: unknown): boolean {
  return defaultCommandApprovalService.isSessionApproved(cmd as Command);
}

export function approveForSession(cmd: unknown): void {
  return defaultCommandApprovalService.approveForSession(cmd as Command);
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
