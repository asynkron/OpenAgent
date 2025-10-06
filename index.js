/**
 * Root entry point for the OpenAgent CLI.
 *
 * Responsibilities:
 * - Wire modular subsystems for OpenAI access, rendering, command execution, and approval flow.
 * - Provide the aggregate export surface that tests exercise for individual helpers.
 * - Dispatch template and shortcut subcommands before starting the interactive agent loop when run directly.
 *
 * Collaborators:
 * - `src/agent/loop.js` drives the interactive conversation flow.
 * - `src/openai/client.js` manages the memoized OpenAI client and model metadata.
 * - `src/commands`, `src/cli`, and `src/config` supply focused utilities that the loop depends upon.
 */

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import 'dotenv/config';

import chalk from 'chalk';

import { getOpenAIClient, resetOpenAIClient, MODEL } from './src/openai/client.js';
import { startThinking, stopThinking, formatElapsedTime } from './src/cli/thinking.js';
import { createInterface, askHuman, ESCAPE_EVENT } from './src/cli/io.js';
import {
  display,
  wrapStructuredContent,
  renderMarkdownMessage,
  renderPlan,
  renderMessage,
  renderCommand
} from './src/cli/render.js';
import { renderRemainingContext } from './src/cli/status.js';
import {
  runCommand,
  runBrowse,
  runEdit,
  runRead,
  runReplace,
  runEscapeString,
  runUnescapeString,
} from './src/commands/run.js';
import {
  loadPreapprovedConfig,
  isPreapprovedCommand,
  isSessionApproved,
  approveForSession,
  resetSessionApprovals,
  commandSignature as __commandSignature,
  PREAPPROVED_CFG,
} from './src/commands/preapproval.js';
import { applyFilter, tailLines, shellSplit } from './src/utils/text.js';
import {
  findAgentFiles,
  buildAgentsPrompt,
  BASE_SYSTEM_PROMPT,
  SYSTEM_PROMPT,
} from './src/config/systemPrompt.js';
import { createAgentLoop, createAgentRuntime, extractResponseText } from './src/agent/loop.js';
import { loadTemplates, renderTemplateCommand, handleTemplatesCli } from './src/templates/cli.js';
import { loadShortcutsFile, findShortcut, handleShortcutsCli } from './src/shortcuts/cli.js';
import { incrementCommandCount } from './src/commands/commandStats.js';

let startupForceAutoApprove = process.argv.slice(2).some((arg) => {
  if (!arg) return false;
  const normalized = String(arg).trim().toLowerCase();
  return (
    normalized === 'auto' ||
    normalized === '--auto' ||
    normalized === '--auto-approve' ||
    normalized === '--auto-approval'
  );
});

let startupNoHuman = process.argv.slice(2).some((arg) => {
  if (!arg) return false;
  const normalized = String(arg).trim().toLowerCase();
  return normalized === 'nohuman' || normalized === '--nohuman' || normalized === '--no-human';
});

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

function maybeHandleCliExtensions(argv = process.argv) {
  const mode = argv[2] || '';
  if (mode === 'templates') {
    handleTemplatesCli(argv);
    return true;
  }
  if (mode === 'shortcuts') {
    handleShortcutsCli(argv);
    return true;
  }
  return false;
}

async function runAgentLoopWithCurrentDependencies() {
  const runtime = createAgentRuntime({
    getAutoApproveFlag: () => exported.STARTUP_FORCE_AUTO_APPROVE,
    getNoHumanFlag: () => exported.STARTUP_NO_HUMAN,
    setNoHumanFlag: (value) => {
      exported.STARTUP_NO_HUMAN = Boolean(value);
    },
    runCommandFn: exported.runCommand,
    runBrowseFn: exported.runBrowse,
    runEditFn: exported.runEdit,
    runReadFn: exported.runRead,
    runReplaceFn: exported.runReplace,
    runEscapeStringFn: exported.runEscapeString,
    runUnescapeStringFn: exported.runUnescapeString,
    applyFilterFn: exported.applyFilter,
    tailLinesFn: exported.tailLines,
    isPreapprovedCommandFn: exported.isPreapprovedCommand,
    isSessionApprovedFn: exported.isSessionApproved,
    approveForSessionFn: exported.approveForSession,
    preapprovedCfg: exported.PREAPPROVED_CFG,
  });

  const rl = exported.createInterface();
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
            exported.startThinking();
          } else {
            exported.stopThinking();
          }
          break;
        case 'assistant-message':
          exported.renderMessage(event.message ?? '');
          break;
        case 'plan':
          exported.renderPlan(Array.isArray(event.plan) ? event.plan : []);
          break;
        case 'context-usage':
          if (event.usage) {
            exported.renderRemainingContext(event.usage);
          }
          break;
        case 'command-result':
          exported.renderCommand(event.command, event.result, {
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
            console.error(chalk.dim(String(event.raw))); // raw JSON snippet
          }
          break;
        }
        case 'request-input': {
          const prompt = event.prompt ?? '\n ▷ ';
          const answer = await exported.askHuman(rl, prompt);
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
    exported.stopThinking();
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

export const exported = {
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
  createAgentRuntime,
  PREAPPROVED_CFG,
  loadTemplates,
  renderTemplateCommand,
  loadShortcutsFile,
  findShortcut,
  runCommandAndTrack,
  handleTemplatesCli,
  handleShortcutsCli,
  agentLoop,
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
  PREAPPROVED_CFG,
  loadTemplates,
  renderTemplateCommand,
  loadShortcutsFile,
  findShortcut,
  handleTemplatesCli,
  handleShortcutsCli,
};

export default exported;

const currentFilePath = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath && currentFilePath === invokedPath) {
  const main = async () => {
    if (maybeHandleCliExtensions(process.argv)) {
      return;
    }

    try {
      await agentLoop();
    } catch (err) {
      if (err && err.message) {
        process.exitCode = 1;
      }
    }
  };

  main();
}
