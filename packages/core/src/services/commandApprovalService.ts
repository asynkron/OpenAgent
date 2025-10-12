// @ts-nocheck
/**
 * Implements command approval helpers, now grouped behind a dedicated
 * `CommandApprovalService` class. The static helpers remain exported for
 * backwards compatibility with callers that still import individual functions.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';

import { shellSplit } from '../utils/text.js';

export class CommandApprovalService {
  /**
   * @param {Object} [options]
   * @param {Object} [options.config]
   * @param {Set<string>} [options.sessionApprovals]
   */
  constructor({ config, sessionApprovals } = {}) {
    this.allowlistConfig = config ?? CommandApprovalService.loadPreapprovedConfig();
    this.sessionApprovals = sessionApprovals ?? new Set();
  }

  /**
   * Return the allowlist configuration associated with the instance.
   * @returns {Object}
   */
  get config() {
    return this.allowlistConfig;
  }

  /**
   * Replace the stored allowlist configuration.
   * Useful for tests that want to inject fixtures without mutating globals.
   * @param {Object} cfg
   */
  set config(cfg) {
    this.allowlistConfig = cfg || { allowlist: [] };
  }

  /**
   * Determine whether the provided command is automatically approved.
   * @param {Object} command
   * @param {Object} [cfg]
   * @returns {boolean}
   */
  isPreapprovedCommand(command, cfg = this.config) {
    return CommandApprovalService.isPreapprovedCommand(command, cfg);
  }

  /**
   * Whether the command has already been approved during this session.
   * @param {Object} command
   * @returns {boolean}
   */
  isSessionApproved(command) {
    try {
      return this.sessionApprovals.has(CommandApprovalService.commandSignature(command));
    } catch (err) {
      return false;
    }
  }

  /**
   * Record the command signature for session-long approvals.
   * @param {Object} command
   */
  approveForSession(command) {
    try {
      this.sessionApprovals.add(CommandApprovalService.commandSignature(command));
    } catch (err) {
      // ignore
    }
  }

  /**
   * Reset all stored session approvals.
   */
  resetSessionApprovals() {
    this.sessionApprovals.clear();
  }

  /**
   * Load the allowlist configuration from disk.
   * @returns {{ allowlist: Array }}
   */
  static loadPreapprovedConfig() {
    const cfgPath = path.join(process.cwd(), 'approved_commands.json');
    try {
      if (fs.existsSync(cfgPath)) {
        const raw = fs.readFileSync(cfgPath, 'utf8');
        const parsed = JSON.parse(raw);
        return parsed && parsed.allowlist ? parsed : { allowlist: [] };
      }
    } catch (err) {
      console.error(chalk.yellow('Warning: Failed to load approved_commands.json:'), err.message);
    }
    return { allowlist: [] };
  }

  /**
   * Lightweight validation to prevent obviously unsafe shell invocations.
   * @param {string} rawCommand
   * @returns {boolean}
   */
  static isCommandStringSafe(rawCommand) {
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
   * @param {Object} cmd
   * @returns {string}
   */
  static commandSignature(cmd) {
    return JSON.stringify({
      shell: cmd?.shell || 'bash',
      run: typeof cmd?.run === 'string' ? cmd.run : '',
      cwd: cmd?.cwd || '.',
    });
  }

  /**
   * Core allowlist evaluation shared by the instance and the static export.
   * @param {Object} command
   * @param {Object} cfg
   * @returns {boolean}
   */
  static isPreapprovedCommand(command, cfg) {
    try {
      const runRaw = (command && command.run ? String(command.run) : '').trim();
      if (!runRaw) return false;

      if (!CommandApprovalService.isCommandStringSafe(runRaw)) return false;

      const shellOpt = command && 'shell' in command ? command.shell : undefined;
      if (typeof shellOpt === 'string') {
        const normalized = String(shellOpt).trim().toLowerCase();
        if (!['bash', 'sh'].includes(normalized)) return false;
      }

      const tokens = shellSplit(runRaw);
      if (!tokens.length) return false;
      const base = path.basename(tokens[0]);

      const list = cfg && Array.isArray(cfg.allowlist) ? cfg.allowlist : [];
      const entry = list.find((item) => item && item.name === base);
      if (!entry) return false;

      let sub = '';
      for (let i = 1; i < tokens.length; i++) {
        const token = tokens[i];
        if (!token.startsWith('-')) {
          sub = token;
          break;
        }
      }

      if (Array.isArray(entry.subcommands) && entry.subcommands.length > 0) {
        if (!entry.subcommands.includes(sub)) return false;
        if (['python', 'python3', 'pip', 'node', 'npm'].includes(base)) {
          const afterIdx = tokens.indexOf(sub);
          if (afterIdx !== -1 && tokens.length > afterIdx + 1) return false;
        }
      }

      const joined = ' ' + tokens.slice(1).join(' ') + ' ';
      switch (base) {
        case 'sed':
          if (/(^|\s)-i(\b|\s)/.test(joined)) return false;
          break;
        case 'find':
          if (/\s-exec\b/.test(joined) || /\s-delete\b/.test(joined)) return false;
          break;
        case 'curl': {
          if (/(^|\s)-X\s*(POST|PUT|PATCH|DELETE)\b/i.test(joined)) return false;
          if (
            /(^|\s)(--data(-binary|-raw|-urlencode)?|-d|--form|-F|--upload-file|-T)\b/i.test(joined)
          )
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
          break;
        }
        case 'wget': {
          if (/\s--spider\b/.test(joined)) {
            // allowed
          } else {
            const tokensAfterBase = tokens.slice(1);
            for (let i = 0; i < tokensAfterBase.length; i++) {
              const token = tokensAfterBase[i];
              if (token === '-O' || token === '--output-document') {
                const name = tokensAfterBase[i + 1] || '';
                if (name !== '-') return false;
              }
              if (token.startsWith('-O') && token !== '-O') return false;
            }
          }
          break;
        }
        case 'ping': {
          const idx = tokens.indexOf('-c');
          if (idx === -1) return false;
          const count = parseInt(tokens[idx + 1], 10);
          if (!Number.isFinite(count) || count > 3 || count < 1) return false;
          break;
        }
        default:
          break;
      }

      return true;
    } catch (err) {
      return false;
    }
  }
}

const defaultCommandApprovalService = new CommandApprovalService();

export const loadPreapprovedConfig = CommandApprovalService.loadPreapprovedConfig;
export const isCommandStringSafe = CommandApprovalService.isCommandStringSafe;
export const commandSignature = CommandApprovalService.commandSignature;

export function isPreapprovedCommand(command, cfg = defaultCommandApprovalService.config) {
  return CommandApprovalService.isPreapprovedCommand(command, cfg);
}

export function isSessionApproved(cmd) {
  return defaultCommandApprovalService.isSessionApproved(cmd);
}

export function approveForSession(cmd) {
  return defaultCommandApprovalService.approveForSession(cmd);
}

export function resetSessionApprovals() {
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
