'use strict';

/**
 * Implements the allowlist validation and in-memory approvals for command execution.
 *
 * Responsibilities:
 * - Parse the approved command configuration from disk.
 * - Determine whether a proposed command is auto-approved.
 * - Track per-session approvals granted via the CLI prompt.
 *
 * Consumers:
 * - `src/agent/loop.js` checks proposals against the allowlist and session approvals.
 * - Unit tests exercise the individual helpers via root re-exports.
 */

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

const { shellSplit } = require('../utils/text');

function loadPreapprovedConfig() {
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

function isPreapprovedCommand(command, cfg) {
  try {
    const runRaw = (command && command.run ? String(command.run) : '').trim();
    if (!runRaw) return false;

    if (/\r|\n/.test(runRaw)) return false;

    if (runRaw.toLowerCase().startsWith('browse ')) {
      const url = runRaw.slice(7).trim();
      if (!url || /\s/.test(url)) return false;
      try {
        const u = new URL(url);
        if (u.protocol === 'http:' || u.protocol === 'https:') return true;
      } catch (err) {
        return false;
      }
      return false;
    }

    const forbidden = [/;|&&|\|\|/, /\|/, /`/, /\$\(/, /<\(/];
    if (forbidden.some((re) => re.test(runRaw))) return false;

    if (/^\s*sudo\b/.test(runRaw)) return false;
    if (/(^|\s)[0-9]*>>?\s/.test(runRaw)) return false;
    if (/\d?>&\d?/.test(runRaw)) return false;

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

const sessionApprovals = new Set();

function commandSignature(cmd) {
  return JSON.stringify({
    shell: cmd.shell || 'bash',
    run: typeof cmd.run === 'string' ? cmd.run : '',
    cwd: cmd.cwd || '.',
  });
}

function isSessionApproved(cmd) {
  try {
    return sessionApprovals.has(commandSignature(cmd));
  } catch (err) {
    return false;
  }
}

function approveForSession(cmd) {
  try {
    sessionApprovals.add(commandSignature(cmd));
  } catch (err) {
    // ignore
  }
}

function resetSessionApprovals() {
  sessionApprovals.clear();
}

const PREAPPROVED_CFG = loadPreapprovedConfig();

module.exports = {
  loadPreapprovedConfig,
  isPreapprovedCommand,
  isSessionApproved,
  approveForSession,
  resetSessionApprovals,
  commandSignature,
  PREAPPROVED_CFG,
};
