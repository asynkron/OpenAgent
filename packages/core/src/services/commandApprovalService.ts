/**
 * Implements command approval helpers, now grouped behind a dedicated
 * `CommandApprovalService` class. The static helpers remain exported for
 * backwards compatibility with callers that still import individual functions.
 */

import { loadPreapprovedConfig as loadPreapprovedConfigFromDisk } from './commandApproval/configLoader.js';
import {
  commandSignature as buildCommandSignatureString,
  isCommandStringSafe as isCommandStringSafeRaw,
} from './commandApproval/commandSafety.js';
import { isCommandPreapproved, buildCommandSignature } from './commandApproval/preapprovalEvaluator.js';
import type { Command, CommandConfig } from './commandApproval/types.js';

interface CommandApprovalServiceOptions {
  readonly config?: CommandConfig;
  readonly sessionApprovals?: Set<string>;
}

export class CommandApprovalService {
  private allowlistConfig: CommandConfig;
  private sessionApprovals: Set<string>;

  constructor({ config, sessionApprovals }: CommandApprovalServiceOptions = {}) {
    this.allowlistConfig = config ?? CommandApprovalService.loadPreapprovedConfig();
    this.sessionApprovals = sessionApprovals ?? new Set();
  }

  get config(): CommandConfig {
    return this.allowlistConfig;
  }

  set config(cfg: CommandConfig | null) {
    this.allowlistConfig = cfg ?? { allowlist: [] };
  }

  isPreapprovedCommand(command: Command, cfg: CommandConfig = this.config): boolean {
    return CommandApprovalService.isPreapprovedCommand(command, cfg);
  }

  isSessionApproved(command: Command): boolean {
    try {
      return this.sessionApprovals.has(buildCommandSignature(command));
    } catch (_err) {
      return false;
    }
  }

  approveForSession(command: Command): void {
    try {
      this.sessionApprovals.add(buildCommandSignature(command));
    } catch (_err) {
      // ignore signature generation errors
    }
  }

  resetSessionApprovals(): void {
    this.sessionApprovals.clear();
  }

  static loadPreapprovedConfig(): CommandConfig {
    return loadPreapprovedConfigFromDisk();
  }

  static isCommandStringSafe(rawCommand: string): boolean {
    return isCommandStringSafeRaw(rawCommand);
  }

  static commandSignature(cmd: Command): string {
    return buildCommandSignatureString(cmd);
  }

  static isPreapprovedCommand(command: Command, cfg: CommandConfig): boolean {
    return isCommandPreapproved(command, cfg);
  }
}

const defaultCommandApprovalService = new CommandApprovalService();

export const loadPreapprovedConfig = CommandApprovalService.loadPreapprovedConfig;
export const isCommandStringSafe = CommandApprovalService.isCommandStringSafe;
export const commandSignature = CommandApprovalService.commandSignature;

export type { Command, CommandConfig };

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
  defaultCommandApprovalService.approveForSession(cmd as Command);
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
