/**
 * Implements the interactive agent loop that powers the CLI experience.
 */

import chalk from 'chalk';

import { SYSTEM_PROMPT } from '../config/systemPrompt.js';
import { getOpenAIClient, MODEL } from '../openai/client.js';
import { startThinking, stopThinking } from '../cli/thinking.js';
import { createInterface, askHuman, ESCAPE_EVENT } from '../cli/io.js';
import { renderPlan, renderMessage, renderCommand } from '../cli/render.js';
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
import { executeAgentPass, extractResponseText } from './passExecutor.js';
import { ApprovalManager } from './approvalManager.js';

const NO_HUMAN_AUTO_MESSAGE = "continue or say 'done'";
const PLAN_PENDING_REMINDER =
  'There are open tasks in the plan. Do you need help or more info? If not, please continue working.';

export function createAgentLoop({
  systemPrompt = SYSTEM_PROMPT,
  getClient = getOpenAIClient,
  model = MODEL,
  createInterfaceFn = createInterface,
  askHumanFn = askHuman,
  startThinkingFn = startThinking,
  stopThinkingFn = stopThinking,
  renderPlanFn = renderPlan,
  renderMessageFn = renderMessage,
  renderCommandFn = renderCommand,
  runCommandFn = runCommand,
  runBrowseFn = runBrowse,
  runEditFn = runEdit,
  runReadFn = runRead,
  runReplaceFn = runReplace,
  runEscapeStringFn = runEscapeString,
  runUnescapeStringFn = runUnescapeString,
  applyFilterFn = applyFilter,
  tailLinesFn = tailLines,
  isPreapprovedCommandFn = isPreapprovedCommand,
  isSessionApprovedFn = isSessionApproved,
  approveForSessionFn = approveForSession,
  preapprovedCfg = PREAPPROVED_CFG,
  getAutoApproveFlag = () => false,
  getNoHumanFlag = () => false,
  setNoHumanFlag = () => {},
} = {}) {
  return async function agentLoop() {
    const history = [
      {
        role: 'system',
        content: systemPrompt,
      },
    ];

    const rl = createInterfaceFn();

    const escState = {
      triggered: false,
      payload: null,
      waiters: new Set(),
    };

    if (rl && typeof rl.on === 'function') {
      rl.on(ESCAPE_EVENT, (payload) => {
        escState.triggered = true;
        escState.payload = payload ?? null;
        if (escState.waiters.size > 0) {
          for (const resolve of Array.from(escState.waiters)) {
            try {
              resolve(payload ?? null);
            } catch (err) {
              // Ignore resolver errors.
            }
          }
          escState.waiters.clear();
        }
      });
    }

    const approvalManager = new ApprovalManager({
      isPreapprovedCommand: isPreapprovedCommandFn,
      isSessionApproved: isSessionApprovedFn,
      approveForSession: approveForSessionFn,
      getAutoApproveFlag,
      askHuman: askHumanFn,
      preapprovedCfg,
      logWarn: (message) => console.log(chalk.yellow(message)),
      logSuccess: (message) => console.log(chalk.green(message)),
    });

    let openai;
    try {
      openai = getClient();
    } catch (err) {
      console.error('Error:', err.message);
      console.error('Please create a .env file with your OpenAI API key.');
      if (rl && typeof rl.close === 'function') {
        rl.close();
      }
      throw err;
    }

    console.log(chalk.bold.blue('\nOpenAgent - AI Agent with JSON Protocol'));
    console.log(chalk.dim('Type "exit" or "quit" to end the conversation.'));
    if (getAutoApproveFlag()) {
      console.log(
        chalk.yellow(
          'Full auto-approval mode enabled via CLI flag. All commands will run without prompting.',
        ),
      );
    }
    if (getNoHumanFlag()) {
      console.log(
        chalk.yellow(
          'No-human mode enabled (--nohuman). Agent will auto-respond with "continue or say \'done\'" until the AI replies "done".',
        ),
      );
    }

    try {
      while (true) {
        const noHumanActive = getNoHumanFlag();
        const userInput = noHumanActive ? NO_HUMAN_AUTO_MESSAGE : await askHumanFn(rl, '\n ▷ ');

        if (!userInput) {
          if (noHumanActive) {
            continue;
          }
          continue;
        }

        if (userInput.toLowerCase() === 'exit' || userInput.toLowerCase() === 'quit') {
          console.log(chalk.green('Goodbye!'));
          break;
        }

        history.push({
          role: 'user',
          content: userInput,
        });

        try {
          let continueLoop = true;

          while (continueLoop) {
            const shouldContinue = await executeAgentPass({
              openai,
              model,
              history,
              renderPlanFn,
              renderMessageFn,
              renderCommandFn,
              runCommandFn,
              runBrowseFn,
              runEditFn,
              runReadFn,
              runReplaceFn,
              runEscapeStringFn,
              runUnescapeStringFn,
              applyFilterFn,
              tailLinesFn,
              getNoHumanFlag,
              setNoHumanFlag,
              planReminderMessage: PLAN_PENDING_REMINDER,
              rl,
              startThinkingFn,
              stopThinkingFn,
              escState,
              approvalManager,
            });

            continueLoop = shouldContinue;
          }
        } catch (error) {
          stopThinkingFn();
          console.error(error);
          if (error.response) {
            console.error('Response:', error.response.data);
          }
        }
      }
    } finally {
      if (rl && typeof rl.close === 'function') {
        rl.close();
      }
    }
  };
}

export { extractResponseText } from './passExecutor.js';

export default {
  createAgentLoop,
  extractResponseText,
};
