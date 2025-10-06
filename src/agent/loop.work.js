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
import { createResponse } from '../openai/responses.js';
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
import { parseReadSpecTokens, mergeReadSpecs } from '../commands/readSpec.js';
import { planHasOpenSteps } from '../utils/plan.js';
import { applyFilter, tailLines, shellSplit } from '../utils/text.js';
import {
  isPreapprovedCommand,
  isSessionApproved,
  approveForSession,
  PREAPPROVED_CFG,
} from '../commands/preapproval.js';
import { incrementCommandCount } from '../commands/commandStats.js';
import { combineStdStreams, buildPreview } from '../utils/output.js';
import ObservationBuilder from './observationBuilder.js';
import { register as registerCancellation } from '../utils/cancellation.js';

const NO_HUMAN_AUTO_MESSAGE = "continue or say 'done'";
const PLAN_PENDING_REMINDER =
  'There are open tasks in the plan. Do you need help or more info? If not, please continue working.';
function createEscWaiter(escState) {
  if (!escState || typeof escState !== 'object') {
    return { promise: null, cleanup: () => { } };
  }

  if (escState.triggered) {
    return {
      promise: Promise.resolve(escState.payload ?? null),
      cleanup: () => { },
    };
  }

  if (!escState.waiters || typeof escState.waiters.add !== 'function') {
    return { promise: null, cleanup: () => { } };
  }

  let resolver;
  const promise = new Promise((resolve) => {
    resolver = (payload) => resolve(payload ?? null);
  });

  escState.waiters.add(resolver);

  const cleanup = () => {
    if (resolver && escState.waiters && typeof escState.waiters.delete === 'function') {
      escState.waiters.delete(resolver);
    }
  };

  return { promise, cleanup };
}

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
  const { promise: escPromise, cleanup: cleanupEscWaiter } = createEscWaiter(escState);

  const observationBuilder = new ObservationBuilder({
    combineStdStreams,
    applyFilter: applyFilterFn,
    tailLines: tailLinesFn,
    buildPreview,
  });

  startThinkingFn();
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const cancellationOp = registerCancellation({
    description: 'openai.responses.create',
    onCancel: controller ? () => controller.abort() : null,
  });

  const requestOptions = controller ? { signal: controller.signal } : undefined;
  const requestPromise = createResponse({
    openai,
    model,
    input: history,
    text: {
      format: { type: 'json_object' },
    },
    options: requestOptions,
  });

  let completion;

  try {
    const raceCandidates = [requestPromise.then((value) => ({ kind: 'completion', value }))];

    if (escPromise) {
      raceCandidates.push(escPromise.then((payload) => ({ kind: 'escape', payload })));
    }

    const outcome = await Promise.race(raceCandidates);

    if (outcome.kind === 'escape') {
      if (cancellationOp && typeof cancellationOp.cancel === 'function') {
        cancellationOp.cancel('esc-key');
      }

      await requestPromise.catch((error) => {
        if (!error) return null;
        if (error.name === 'APIUserAbortError') return null;
        if (typeof error.message === 'string' && error.message.includes('aborted')) {
          return null;
        }
        throw error;
      });

      if (escState) {
        escState.triggered = false;
        escState.payload = null;
      }

      console.log(chalk.yellow('Operation canceled via ESC key.'));

      if (typeof setNoHumanFlag === 'function') {
        setNoHumanFlag(false);
      }

      const observation = observationBuilder.buildCancellationObservation({
        reason: 'escape_key',
        message: 'Human pressed ESC to cancel the in-flight request.',
        metadata: { esc_payload: outcome.payload ?? null },
      });

      history.push({ role: 'user', content: JSON.stringify(observation) });
      return false;
    }

    completion = outcome.value;
  } catch (error) {
    if (
      error &&
      (error.name === 'APIUserAbortError' ||
        (typeof error.message === 'string' && error.message.includes('aborted')))
    ) {
      if (escState) {
        escState.triggered = false;
        escState.payload = null;
      }

      console.log(chalk.yellow('Operation canceled.'));

      if (typeof setNoHumanFlag === 'function') {
        setNoHumanFlag(false);
      }

      const observation = observationBuilder.buildCancellationObservation({
        reason: 'abort',
        message: 'The in-flight request was aborted before completion.',
      });

      history.push({ role: 'user', content: JSON.stringify(observation) });
      return false;
    }

    throw error;
  } finally {
    cleanupEscWaiter();
    if (cancellationOp && typeof cancellationOp.unregister === 'function') {
      cancellationOp.unregister();
    }
    stopThinkingFn();
  }

  if (escState) {
    escState.triggered = false;
    escState.payload = null;
  }

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
        message: `Failed to parse assistant JSON: ${err instanceof Error ? err.message : String(err)}`,
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

  const autoApprovedAllowlist = isPreapprovedCommandFn(parsed.command, preapprovedCfg);
  const autoApprovedSession = isSessionApprovedFn(parsed.command);
  const autoApprovedCli = getAutoApproveFlag();
  const autoApproved = autoApprovedAllowlist || autoApprovedSession || autoApprovedCli;

  if (autoApproved) {
    // if (autoApprovedAllowlist) {
    //   console.log(chalk.green('Auto-approved by allowlist (approved_commands.json)'));
    // } else if (autoApprovedSession) {
    //   console.log(chalk.green('Auto-approved by session approvals'));
    // } else {
    //   console.log(chalk.green('Auto-approved by CLI flag (--auto-approve)'));
    // }
  } else {
    let selection;
    while (true) {
      const input = (
        await askHumanFn(
          rl,
          `Approve running this command?
  1) Yes (run once)
  2) Yes, for entire session (add to in-memory approvals)
  3) No, tell the AI to do something else
Select 1, 2, or 3: `,
        )
      )
        .trim()
        .toLowerCase();
      if (input === '1' || input === 'y' || input === 'yes') {
        selection = 1;
        break;
      }
      if (input === '2') {
        selection = 2;
        break;
      }
      if (input === '3' || input === 'n' || input === 'no') {
        selection = 3;
        break;
      }
      console.log(chalk.yellow('Please enter 1, 2, or 3.'));
    }

    if (selection === 3) {
      console.log(chalk.yellow('Command execution canceled by human (requested alternative).'));
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
    if (selection === 2) {
      approveForSessionFn(parsed.command);
      console.log(chalk.green('Approved and added to session approvals.'));
    } else {
      console.log(chalk.green('Approved (run once).'));
    }
  }

  let result;
  let executionDetails = { type: 'EXECUTE', command: parsed.command };
  if (parsed.command && parsed.command.edit) {
    result = await runEditFn(parsed.command.edit, parsed.command.cwd || '.');
    executionDetails = { type: 'EDIT', spec: parsed.command.edit };
  }

  if (typeof result === 'undefined' && parsed.command && parsed.command.read) {
    result = await runReadFn(parsed.command.read, parsed.command.cwd || '.');
    executionDetails = { type: 'READ', spec: parsed.command.read };
  }

  if (typeof result === 'undefined' && parsed.command && parsed.command.escape_string) {
    result = await runEscapeStringFn(parsed.command.escape_string, parsed.command.cwd || '.');
    executionDetails = { type: 'ESCAPE_STRING', spec: parsed.command.escape_string };
  }

  if (typeof result === 'undefined' && parsed.command && parsed.command.unescape_string) {
    result = await runUnescapeStringFn(parsed.command.unescape_string, parsed.command.cwd || '.');
    executionDetails = { type: 'UNESCAPE_STRING', spec: parsed.command.unescape_string };
  }

  if (typeof result === 'undefined' && parsed.command && parsed.command.replace) {
    result = await runReplaceFn(parsed.command.replace, parsed.command.cwd || '.');
    executionDetails = { type: 'REPLACE', spec: parsed.command.replace };
  }

  if (typeof result === 'undefined') {
    const runStrRaw = typeof parsed.command.run === 'string' ? parsed.command.run : '';
    const runStr = runStrRaw.trim();

    if (runStr) {
      const tokens = shellSplit(runStr);
      const commandKeyword = tokens[0] ? tokens[0].toLowerCase() : '';

      if (commandKeyword === 'browse') {
        const target = tokens.slice(1).join(' ').trim();
        if (target) {
          result = await runBrowseFn(target, parsed.command.timeout_sec ?? 60);
          executionDetails = { type: 'BROWSE', target };
        }
      } else if (commandKeyword === 'read') {
        const readTokens = tokens.slice(1);
        const specFromTokens = parseReadSpecTokens(readTokens);
        const mergedSpec = mergeReadSpecs(parsed.command.read || {}, specFromTokens);

        if (mergedSpec.path) {
          result = await runReadFn(mergedSpec, parsed.command.cwd || '.');
          executionDetails = { type: 'READ', spec: mergedSpec };
        } else {
          result = {
            stdout: '',
            stderr: 'read command requires a path argument',
            exit_code: 1,
            killed: false,
            runtime_ms: 0,
          };
        }
      }
    }

    if (typeof result === 'undefined') {
      result = await runCommandFn(
        parsed.command.run,
        parsed.command.cwd || '.',
        parsed.command.timeout_sec ?? 60,
        parsed.command.shell,
      );
      executionDetails = { type: 'EXECUTE', command: parsed.command };
    }
  }

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
  setNoHumanFlag = () => { },
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
