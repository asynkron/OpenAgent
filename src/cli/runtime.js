import chalk from 'chalk';

import {
  getAutoApproveFlag,
  getNoHumanFlag,
  getPlanMergeFlag,
  getDebugFlag,
  setNoHumanFlag,
} from '../lib/startupFlags.js';
import { createAgentRuntime } from '../agent/loop.js';
import { startThinking, stopThinking } from './thinking.js';
import { createInterface, askHuman, ESCAPE_EVENT } from './io.js';
import { renderPlan, renderMessage, renderCommand, renderPlanProgress } from './render.js';
import { renderRemainingContext } from './status.js';
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
  isPreapprovedCommand,
  isSessionApproved,
  approveForSession,
  PREAPPROVED_CFG,
} from '../commands/preapproval.js';
import { applyFilter, tailLines } from '../utils/text.js';
import { incrementCommandCount } from '../commands/commandStats.js';

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
    getPlanMergeFlag,
    getDebugFlag,
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
        case 'plan-progress':
          renderPlanProgress(event.progress);
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
        case 'debug': {
          const payload = event.payload;
          let formatted = '';
          if (typeof payload === 'string') {
            formatted = payload;
          } else {
            try {
              formatted = JSON.stringify(payload, null, 2);
            } catch {
              formatted = String(payload);
            }
          }
          if (formatted) {
            console.log(chalk.gray(`[debug] ${formatted}`));
          }
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

export default {
  agentLoop,
  runCommandAndTrack,
};
