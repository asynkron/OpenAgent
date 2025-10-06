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

import { getOpenAIClient, resetOpenAIClient, MODEL } from './src/openai/client.js';
import { startThinking, stopThinking, formatElapsedTime } from './src/cli/thinking.js';
import { createInterface, askHuman } from './src/cli/io.js';
import {
  display,
  wrapStructuredContent,
  renderMarkdownMessage,
  renderPlan,
  renderMessage,
  renderCommand,
  inferLanguageFromDetectors,
  detectLanguage,
} from './src/cli/render.js';
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
import { createAgentLoop, extractResponseText } from './src/agent/loop.js';
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
  const loop = createAgentLoop({
    getAutoApproveFlag: () => exported.STARTUP_FORCE_AUTO_APPROVE,
    getNoHumanFlag: () => exported.STARTUP_NO_HUMAN,
    setNoHumanFlag: (value) => {
      exported.STARTUP_NO_HUMAN = Boolean(value);
    },
    createInterfaceFn: exported.createInterface,
    askHumanFn: exported.askHuman,
    startThinkingFn: exported.startThinking,
    stopThinkingFn: exported.stopThinking,
    renderPlanFn: exported.renderPlan,
    renderMessageFn: exported.renderMessage,
    renderCommandFn: exported.renderCommand,
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
  return loop();
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
  createInterface,
  askHuman,
  renderMessage,
  renderCommand,
  inferLanguageFromDetectors,
  detectLanguage,
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
  inferLanguageFromDetectors,
  detectLanguage,
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
