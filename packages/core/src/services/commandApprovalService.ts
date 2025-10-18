import * as fs from 'node:fs';
import * as path from 'node:path';

import chalk from 'chalk';

import { findAllowlistEntry, isSubcommandAllowed } from './commandApprovalAllowlist.js';
import {
  isCommandStringSafe as guardIsCommandStringSafe,
  parseCommandForApproval,
} from './commandApprovalParser.js';
import { passesCommandSpecificRules } from './commandApprovalCommandRules.js';
import type { Command, CommandConfig } from './commandApprovalTypes.js';

interface CommandApprovalServiceOptions {
  readonly config?: CommandConfig;
  readonly sessionApprovals?: Set<string>;
}

const EMPTY_CONFIG: CommandConfig = { allowlist: [] };

export class CommandApprovalService {
  private allowlistConfig: CommandConfig;

  private readonly sessionApprovals: Set<string>;

  constructor({ config, sessionApprovals }: CommandApprovalServiceOptions = {}) {
    this.allowlistConfig = config ?? CommandApprovalService.loadPreapprovedConfig();
    this.sessionApprovals = sessionApprovals ?? new Set();
  }

  get config(): CommandConfig {
    return this.allowlistConfig;
  }

  set config(next: CommandConfig | null) {
    this.allowlistConfig = next ?? EMPTY_CONFIG;
  }

  isPreapprovedCommand(command: Command, cfg: CommandConfig = this.config): boolean {
    return CommandApprovalService.isPreapprovedCommand(command, cfg);
  }

  isSessionApproved(command: Command): boolean {
    try {
      return this.sessionApprovals.has(CommandApprovalService.commandSignature(command));
    } catch (_error) {
      return false;
    }
  }

  approveForSession(command: Command): void {
    try {
      this.sessionApprovals.add(CommandApprovalService.commandSignature(command));
    } catch (_error) {
      // ignore signature serialization errors
    }
  }

  resetSessionApprovals(): void {
    this.sessionApprovals.clear();
  }

  static loadPreapprovedConfig(): CommandConfig {
    const configPath = path.join(process.cwd(), 'approved_commands.json');

    try {
      if (!fs.existsSync(configPath)) {
        return EMPTY_CONFIG;
      }

      const raw = fs.readFileSync(configPath, 'utf8');
      const parsed = JSON.parse(raw) as { allowlist?: unknown };
      const allowlistSource = Array.isArray(parsed.allowlist) ? parsed.allowlist : [];
      const allowlist: CommandConfig['allowlist'] = [];

      for (const entry of allowlistSource) {
        if (!entry || typeof entry !== 'object') {
          continue;
        }

        const { name, subcommands } = entry as {
          name?: unknown;
          subcommands?: unknown;
        };

        if (typeof name !== 'string') {
          continue;
        }

        const normalizedEntry = {
          name,
          subcommands: Array.isArray(subcommands)
            ? subcommands.filter((item): item is string => typeof item === 'string')
            : undefined,
        };

        allowlist.push(normalizedEntry);
      }

      return { allowlist };
    } catch (error) {
      console.error(
        chalk.yellow('Warning: Failed to load approved_commands.json:'),
        (error as Error).message,
      );
      return EMPTY_CONFIG;
    }
  }

  static isPreapprovedCommand(command: Command, cfg: CommandConfig): boolean {
    try {
      const parsed = parseCommandForApproval(command);
      if (!parsed) {
        return false;
      }

      const entry = findAllowlistEntry(parsed.base, cfg);
      if (!entry) {
        return false;
      }

      if (!isSubcommandAllowed(parsed.base, parsed.tokens, entry)) {
        return false;
      }

      return passesCommandSpecificRules(parsed.base, parsed.tokens);
    } catch (_error) {
      return false;
    }
  }

  static commandSignature(command: Command): string {
    return JSON.stringify({
      shell: typeof command.shell === 'string' ? command.shell : 'bash',
      run: typeof command.run === 'string' ? command.run : '',
      cwd: typeof command.cwd === 'string' && command.cwd.length > 0 ? command.cwd : '.',
    });
  }
}

const defaultService = new CommandApprovalService();

export type { Command, CommandConfig };

export const loadPreapprovedConfig = CommandApprovalService.loadPreapprovedConfig;
export const commandSignature = CommandApprovalService.commandSignature;
export const isCommandStringSafe = guardIsCommandStringSafe;

export function isPreapprovedCommand(
  command: unknown,
  cfg: unknown = defaultService.config,
): boolean {
  return CommandApprovalService.isPreapprovedCommand(command as Command, cfg as CommandConfig);
}

export function isSessionApproved(command: unknown): boolean {
  return defaultService.isSessionApproved(command as Command);
}

export function approveForSession(command: unknown): void {
  defaultService.approveForSession(command as Command);
}

export function resetSessionApprovals(): void {
  defaultService.resetSessionApprovals();
}

export const PREAPPROVED_CFG = defaultService.config;
export const sessionApprovalService = defaultService;

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
