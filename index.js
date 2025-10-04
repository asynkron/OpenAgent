"use strict";

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

require('dotenv').config();

const {
  getOpenAIClient,
  resetOpenAIClient,
  MODEL,
} = require('./src/openai/client');
const {
  startThinking,
  stopThinking,
  formatElapsedTime,
} = require('./src/cli/thinking');
const { createInterface, askHuman } = require('./src/cli/io');
const {
  display,
  wrapStructuredContent,
  renderMarkdownMessage,
  renderPlan,
  renderMessage,
  renderCommand,
  renderCommandResult,
} = require('./src/cli/render');
const { runCommand, runBrowse } = require('./src/commands/run');
const {
  loadPreapprovedConfig,
  isPreapprovedCommand,
  isSessionApproved,
  approveForSession,
  resetSessionApprovals,
  commandSignature: __commandSignature,
  PREAPPROVED_CFG,
} = require('./src/commands/preapproval');
const { applyFilter, tailLines, shellSplit } = require('./src/utils/text');
const {
  findAgentFiles,
  buildAgentsPrompt,
  BASE_SYSTEM_PROMPT,
  SYSTEM_PROMPT,
} = require('./src/config/systemPrompt');
const {
  createAgentLoop,
  extractResponseText,
} = require('./src/agent/loop');
const {
  loadTemplates,
  renderTemplateCommand,
  handleTemplatesCli,
} = require('./src/templates/cli');
const {
  loadShortcutsFile,
  findShortcut,
  handleShortcutsCli,
} = require('./src/shortcuts/cli');

let startupForceAutoApprove = process.argv
  .slice(2)
  .some((arg) => {
    if (!arg) return false;
    const normalized = String(arg).trim().toLowerCase();
    return (
      normalized === 'auto' ||
      normalized === '--auto' ||
      normalized === '--auto-approve' ||
      normalized === '--auto-approval'
    );
  });

async function runCommandAndTrack(run, cwd = '.', timeoutSec = 60) {
  const result = await runCommand(run, cwd, timeoutSec);
  try {
    const { incrementCommandCount } = require('./cmd_tracker');
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

const exported = {
  get STARTUP_FORCE_AUTO_APPROVE() {
    return startupForceAutoApprove;
  },
  set STARTUP_FORCE_AUTO_APPROVE(value) {
    startupForceAutoApprove = Boolean(value);
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
  renderCommandResult,
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
};

function runAgentLoopWithCurrentDependencies() {
  const loop = createAgentLoop({
    getAutoApproveFlag: () => exported.STARTUP_FORCE_AUTO_APPROVE,
    createInterfaceFn: exported.createInterface,
    askHumanFn: exported.askHuman,
    startThinkingFn: exported.startThinking,
    stopThinkingFn: exported.stopThinking,
    renderPlanFn: exported.renderPlan,
    renderMessageFn: exported.renderMessage,
    renderCommandFn: exported.renderCommand,
    renderCommandResultFn: exported.renderCommandResult,
    runCommandFn: exported.runCommand,
    runBrowseFn: exported.runBrowse,
    applyFilterFn: exported.applyFilter,
    tailLinesFn: exported.tailLines,
    isPreapprovedCommandFn: exported.isPreapprovedCommand,
    isSessionApprovedFn: exported.isSessionApproved,
    approveForSessionFn: exported.approveForSession,
    preapprovedCfg: exported.PREAPPROVED_CFG,
  });
  return loop();
}

exported.agentLoop = function agentLoop() {
  return runAgentLoopWithCurrentDependencies();
};

module.exports = exported;

if (require.main === module) {
  if (!maybeHandleCliExtensions(process.argv)) {
    exported.agentLoop().catch((err) => {
      if (err && err.message) {
        process.exitCode = 1;
      }
    });
  }
}
