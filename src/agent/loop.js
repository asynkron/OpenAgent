/**
 * Implements the interactive agent loop that powers the CLI experience.
 *
 * Responsibilities:
 * - Maintain the conversation history with OpenAI responses.
 * - Render assistant output, prompt the human for approvals, and execute commands.
 * - Feed execution results back to the model to continue the workflow.
 *
 * Consumers:
 * - Root `index.js` creates a configured loop via `createAgentLoop()` and exposes it as `agentLoop`.
 * - Integration tests re-export the same function to run mocked scenarios.
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
import { planHasOpenSteps } from '../utils/plan.js';
import { applyFilter, tailLines } from '../utils/text.js';
import {
  isPreapprovedCommand,
  isSessionApproved,
  approveForSession,
  PREAPPROVED_CFG,
} from '../commands/preapproval.js';
import { incrementCommandCount } from '../commands/commandStats.js';
import { combineStdStreams, buildPreview } from '../utils/output.js';
import ObservationBuilder from './observationBuilder.js';
import { requestModelCompletion } from './openaiRequest.js';
import { ensureCommandApproval } from './commandApproval.js';
import { executeAgentCommand } from './commandExecution.js';

const NO_HUMAN_AUTO_MESSAGE = "continue or say 'done'";
const PLAN_PENDING_REMINDER =
  'There are open tasks in the plan. Do you need help or more info? If not, please continue working.';
export function extractResponseText(response) {
  if (!response || typeof response !== 'object') {
    return '';
  }

  if (typeof response.output_text === 'string') {
    const normalized = response.output_text.trim();
    if (normalized) {
      return normalized;
    }
  }

  const outputs = Array.isArray(response.output) ? response.output : [];
  for (const item of outputs) {
    if (!item || item.type !== 'message' || !Array.isArray(item.content)) {
      continue;
    }

    for (const part of item.content) {
      if (part && part.type === 'output_text' && typeof part.text === 'string') {
        const normalized = part.text.trim();
        if (normalized) {
          return normalized;
        }
      }
    }
  }

  return '';
}
async function executeAgentPass({
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
  isPreapprovedCommandFn,
  isSessionApprovedFn,
  approveForSessionFn,
  preapprovedCfg,
  getAutoApproveFlag,
  getNoHumanFlag,
  setNoHumanFlag,
  askHumanFn,
  rl,
  startThinkingFn,
  stopThinkingFn,
  escState,
}) {
  const observationBuilder = new ObservationBuilder({
    combineStdStreams,
    applyFilter: applyFilterFn,
    tailLines: tailLinesFn,
    buildPreview,
  });

  const completionResult = await requestModelCompletion({
    openai,
    model,
    history,
    observationBuilder,
    escState,
    startThinkingFn,
    stopThinkingFn,
    setNoHumanFlag,
  });

  if (completionResult.status === 'canceled') {
    return false;
  }

  const { completion } = completionResult;
  const responseContent = extractResponseText(completion);

  if (!responseContent) {
    console.error(chalk.red('Error: OpenAI response did not include text output.'));
    return false;
  }

  history.push({
    role: 'assistant',
    content: responseContent,
  });

  let parsed;
  try {
    parsed = JSON.parse(responseContent);
  } catch (err) {
    console.error(chalk.red('Error: LLM returned invalid JSON'));
    console.error('Response:', responseContent);

    const observation = {
      observation_for_llm: {
        json_parse_error: true,
        message: `Failed to parse assistant JSON: ${
          err instanceof Error ? err.message : String(err)
        }`,
        response_snippet: responseContent.slice(0, 4000),
      },
      observation_metadata: {
        timestamp: new Date().toISOString(),
      },
    };

    history.push({ role: 'user', content: JSON.stringify(observation) });
    return true;
  }

  // This is correct. AI message is just vanilla markdown.
  renderMessageFn(parsed.message);
  renderPlanFn(parsed.plan);

  if (!parsed.command) {
    if (
      typeof getNoHumanFlag === 'function' &&
      typeof setNoHumanFlag === 'function' &&
      getNoHumanFlag()
    ) {
      const maybeMessage =
        typeof parsed.message === 'string' ? parsed.message.trim().toLowerCase() : '';
      const normalizedMessage = maybeMessage.replace(/[.!]+$/, '');
      if (normalizedMessage === 'done') {
        setNoHumanFlag(false);
      }
    }

    if (Array.isArray(parsed.plan) && planHasOpenSteps(parsed.plan)) {
      console.log(chalk.yellow(PLAN_PENDING_REMINDER));
      history.push({
        role: 'user',
        content: PLAN_PENDING_REMINDER,
      });
      return true;
    }

    return false;
  }

  const approved = await ensureCommandApproval({
    command: parsed.command,
    isPreapprovedCommandFn,
    isSessionApprovedFn,
    approveForSessionFn,
    preapprovedCfg,
    getAutoApproveFlag,
    askHumanFn,
    rl,
  });

  if (!approved) {
    const observation = {
      observation_for_llm: {
        canceled_by_human: true,
        message:
          'Human declined to execute the proposed command and asked the AI to propose an alternative approach without executing a command.',
      },
      observation_metadata: {
        timestamp: new Date().toISOString(),
      },
    };

    history.push({ role: 'user', content: JSON.stringify(observation) });
    return true;
  }

  const { result, executionDetails } = await executeAgentCommand({
    command: parsed.command,
    runCommandFn,
    runBrowseFn,
    runEditFn,
    runReadFn,
    runReplaceFn,
    runEscapeStringFn,
    runUnescapeStringFn,
  });

  let key = parsed?.command?.key;
  if (!key) {
    if (typeof parsed?.command?.run === 'string') {
      key = parsed.command.run.trim().split(/\s+/)[0] || 'unknown';
    } else {
      key = 'unknown';
    }
  }
  try {
    await incrementCommandCount(key);
  } catch (error) {
    // Ignore stats failures intentionally.
  }

  const { renderPayload, observation } = observationBuilder.build({
    command: parsed.command,
    result,
  });

  renderCommandFn(parsed.command, result, {
    ...renderPayload,
    execution: executionDetails,
  });

  history.push({
    role: 'user',
    content: JSON.stringify(observation),
  });

  return true;
}

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

    let openai;
    try {
      openai = getClient();
    } catch (err) {
      console.error('Error:', err.message);
      console.error('Please create a .env file with your OpenAI API key.');
      rl.close();
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
              isPreapprovedCommandFn,
              isSessionApprovedFn,
              approveForSessionFn,
              preapprovedCfg,
              getAutoApproveFlag,
              getNoHumanFlag,
              setNoHumanFlag,
              askHumanFn,
              rl,
              startThinkingFn,
              stopThinkingFn,
              escState,
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
      rl.close();
    }
  };
}

export default {
  createAgentLoop,
  extractResponseText,
};
