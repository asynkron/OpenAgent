/**
 * Aggregated library entry for the OpenAgent runtime.
 *
 * Responsibilities:
 * - Wire modular subsystems for OpenAI access, rendering, command execution, and approval flow.
 * - Provide the aggregate export surface that tests exercise for individual helpers.
 * - Expose helpers that the CLI runner can consume without forcing consumers to import CLI glue.
 *
 * Collaborators:
 * - `src/agent/loop.js` drives the interactive conversation flow.
 * - `src/openai/client.js` manages the memoized OpenAI client and model metadata.
 * - `src/commands`, `src/cli`, and `src/config` supply focused utilities that the loop depends upon.
 */

import 'dotenv/config';

import chalk from 'chalk';

import { getOpenAIClient, resetOpenAIClient, MODEL } from '../openai/client.js';
import { startThinking, stopThinking, formatElapsedTime } from '../cli/thinking.js';
import { createInterface, askHuman, ESCAPE_EVENT } from '../cli/io.js';
import {
  display,
  wrapStructuredContent,
  renderMarkdownMessage,
  renderPlan,
  renderMessage,
  renderCommand,
} from '../cli/render.js';
import { renderRemainingContext } from '../cli/status.js';
import {
  runCommand,
  runBrowse,
  runEdit,
  runRead,
  runReplace,
  runEscapeString,
  runUnescapeString,
} from '../commands/run.js';
import {
  loadPreapprovedConfig,
  isPreapprovedCommand,
  isSessionApproved,
  approveForSession,
  resetSessionApprovals,
  commandSignature as __commandSignature,
  PREAPPROVED_CFG,
} from '../commands/preapproval.js';
import { applyFilter, tailLines, shellSplit } from '../utils/text.js';
import {
  findAgentFiles,
  buildAgentsPrompt,
  BASE_SYSTEM_PROMPT,
  SYSTEM_PROMPT,
} from '../config/systemPrompt.js';
import { createAgentLoop, createAgentRuntime, extractResponseText } from '../agent/loop.js';
import { loadTemplates, renderTemplateCommand, handleTemplatesCli } from '../templates/cli.js';
import { loadShortcutsFile, findShortcut, handleShortcutsCli } from '../shortcuts/cli.js';
import { incrementCommandCount } from '../commands/commandStats.js';

/**
 * Flags derived from CLI usage (auto-approve, headless). They default to `false`
 * for library consumers and can be configured through `setStartupFlags`,
 * `parseStartupFlagsFromArgv`, or `applyStartupFlagsFromArgv`.
 */
let startupForceAutoApprove = false;
let startupNoHuman = false;

function getAutoApproveFlag() {
  return startupForceAutoApprove;
}

function getNoHumanFlag() {
  return startupNoHuman;
}

function setNoHumanFlag(value) {
  startupNoHuman = Boolean(value);
}

export function setStartupFlags({ forceAutoApprove = false, noHuman = false } = {}) {
  startupForceAutoApprove = Boolean(forceAutoApprove);
  startupNoHuman = Boolean(noHuman);
}

export function parseStartupFlagsFromArgv(argv = process.argv) {
  const positional = Array.isArray(argv) ? argv.slice(2) : [];
  let forceAutoApprove = false;
  let noHuman = false;

  for (const arg of positional) {
    if (!arg) continue;
    const normalized = String(arg).trim().toLowerCase();
    if (
      normalized === 'auto' ||
      normalized === '--auto' ||
      normalized === '--auto-approve' ||
      normalized === '--auto-approval'
    ) {
      forceAutoApprove = true;
    }

    if (normalized === 'nohuman' || normalized === '--nohuman' || normalized === '--no-human') {
      noHuman = true;
    }
  }

  return { forceAutoApprove, noHuman };
}

export function applyStartupFlagsFromArgv(argv = process.argv) {
  const flags = parseStartupFlagsFromArgv(argv);
  setStartupFlags(flags);
  return flags;
}

export async function runCommandAndTrack(run, cwd = '.', timeoutSec = 60) {
  const result = await runCommand(run, cwd, timeoutSec);
  try {
    let key = 'unknown';
    if (Array.isArray(run) && run.length > 0) key = String(run[0]);
    else if (typeof run === 'string' && run.trim().length > 0) key = run.trim().split(/\s+/)[0];
    await incrementCommandCount(key).catch(() => {});
  } catch (err) {
    // Ignore stats failures intentionally.
  }
  return result;
}

async function runAgentLoopWithCurrentDependencies() {
  const runtime = createAgentRuntime({
    getAutoApproveFlag,
    getNoHumanFlag,
    setNoHumanFlag,
    runCommandFn: runCommand,
    runBrowseFn: runBrowse,
    runEditFn: runEdit,
    runReadFn: runRead,
    runReplaceFn: runReplace,
    runEscapeStringFn: runEscapeString,
    runUnescapeStringFn: runUnescapeString,
    applyFilterFn: applyFilter,
    tailLinesFn: tailLines,
    isPreapprovedCommandFn: isPreapprovedCommand,
    isSessionApprovedFn: isSessionApproved,
    approveForSessionFn: approveForSession,
    preapprovedCfg: PREAPPROVED_CFG,
  });

  const rl = createInterface();
  const handleEscape = (payload) => {
    runtime.cancel({ reason: 'escape-key', payload });
  };
  rl.on(ESCAPE_EVENT, handleEscape);

  const outputProcessor = (async () => {
    for await (const event of runtime.outputs) {
      if (!event || typeof event !== 'object') continue;

      switch (event.type) {
        case 'banner':
          if (event.title) {
            console.log(chalk.bold.blue(`\n${event.title}`));
          }
          if (event.subtitle) {
            console.log(chalk.dim(event.subtitle));
          }
          break;
        case 'status': {
          const message = event.message ?? '';
          if (!message) break;
          if (event.level === 'warn') {
            console.log(chalk.yellow(message));
          } else if (event.level === 'error') {
            console.log(chalk.red(message));
          } else if (event.level === 'success') {
            console.log(chalk.green(message));
          } else {
            console.log(message);
          }
          if (event.details) {
            console.log(chalk.dim(String(event.details)));
          }
          break;
        }
        case 'thinking':
          if (event.state === 'start') {
            startThinking();
          } else {
            stopThinking();
          }
          break;
        case 'assistant-message':
          renderMessage(event.message ?? '');
          break;
        case 'plan':
          renderPlan(Array.isArray(event.plan) ? event.plan : []);
          break;
        case 'context-usage':
          if (event.usage) {
            renderRemainingContext(event.usage);
          }
          break;
        case 'command-result':
          renderCommand(event.command, event.result, {
            ...(event.preview || {}),
            execution: event.execution,
          });
          break;
        case 'error': {
          const base = event.message || 'Agent error encountered.';
          console.error(chalk.red(base));
          if (event.details) {
            console.error(chalk.dim(String(event.details)));
          }
          if (event.raw) {
            console.error(chalk.dim(String(event.raw)));
          }
          break;
        }
        case 'request-input': {
          const prompt = event.prompt ?? '\n ▷ ';
          const answer = await askHuman(rl, prompt);
          runtime.submitPrompt(answer);
          break;
        }
        default:
          break;
      }
    }
  })();

  let outputError = null;
  try {
    await runtime.start();
  } finally {
    rl.off?.(ESCAPE_EVENT, handleEscape);
    rl.close?.();
    stopThinking();
    try {
      await outputProcessor;
    } catch (err) {
      outputError = err;
    }
  }

  if (outputError) {
    throw outputError;
  }
}

export async function agentLoop() {
  return runAgentLoopWithCurrentDependencies();
}

const exported = {
  get STARTUP_FORCE_AUTO_APPROVE() {
    return startupForceAutoApprove;
  },
  set STARTUP_FORCE_AUTO_APPROVE(value) {
    startupForceAutoApprove = Boolean(value);
  },
  get STARTUP_NO_HUMAN() {
    return startupNoHuman;
  },
  set STARTUP_NO_HUMAN(value) {
    startupNoHuman = Boolean(value);
  },
  MODEL,
  getOpenAIClient,
  resetOpenAIClient,
  startThinking,
  stopThinking,
  formatElapsedTime,
  findAgentFiles,
  buildAgentsPrompt,
  BASE_SYSTEM_PROMPT,
  SYSTEM_PROMPT,
  runCommand,
  runBrowse,
  runEdit,
  runRead,
  runReplace,
  runEscapeString,
  runUnescapeString,
  applyFilter,
  tailLines,
  shellSplit,
  display,
  wrapStructuredContent,
  renderMarkdownMessage,
  renderPlan,
  renderRemainingContext,
  createInterface,
  askHuman,
  renderMessage,
  renderCommand,
  loadPreapprovedConfig,
  isPreapprovedCommand,
  __commandSignature,
  isSessionApproved,
  approveForSession,
  resetSessionApprovals,
  extractResponseText,
  createAgentLoop,
  createAgentRuntime,
  PREAPPROVED_CFG,
  loadTemplates,
  renderTemplateCommand,
  loadShortcutsFile,
  findShortcut,
  runCommandAndTrack,
  agentLoop,
  setStartupFlags,
  parseStartupFlagsFromArgv,
  applyStartupFlagsFromArgv,
  handleTemplatesCli,
  handleShortcutsCli,
};

export {
  MODEL,
  getOpenAIClient,
  resetOpenAIClient,
  startThinking,
  stopThinking,
  formatElapsedTime,
  findAgentFiles,
  buildAgentsPrompt,
  BASE_SYSTEM_PROMPT,
  SYSTEM_PROMPT,
  runCommand,
  runBrowse,
  runEdit,
  runRead,
  runReplace,
  runEscapeString,
  runUnescapeString,
  applyFilter,
  tailLines,
  shellSplit,
  display,
  wrapStructuredContent,
  renderMarkdownMessage,
  renderPlan,
  renderRemainingContext,
  createInterface,
  askHuman,
  renderMessage,
  renderCommand,
  loadPreapprovedConfig,
  isPreapprovedCommand,
  __commandSignature,
  isSessionApproved,
  approveForSession,
  resetSessionApprovals,
  extractResponseText,
  createAgentLoop,
  createAgentRuntime,
  PREAPPROVED_CFG,
  loadTemplates,
  renderTemplateCommand,
  loadShortcutsFile,
  findShortcut,
  handleTemplatesCli,
  handleShortcutsCli,
};

export default exported;
