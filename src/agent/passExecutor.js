import chalk from 'chalk';

import { planHasOpenSteps } from '../utils/plan.js';
import { incrementCommandCount } from '../commands/commandStats.js';
import { combineStdStreams, buildPreview } from '../utils/output.js';
import ObservationBuilder from './observationBuilder.js';
import { requestModelCompletion } from './openaiRequest.js';
import { executeAgentCommand } from './commandExecution.js';
import { summarizeContextUsage } from '../utils/contextUsage.js';
import { extractResponseText } from '../openai/responseUtils.js';

export async function executeAgentPass({
  openai,
  model,
  history,
  renderPlanFn,
  renderMessageFn,
  renderCommandFn,
  renderContextUsageFn,
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
  planReminderMessage,
  rl,
  startThinkingFn,
  stopThinkingFn,
  escState,
  approvalManager,
  historyCompactor,
}) {
  const observationBuilder = new ObservationBuilder({
    combineStdStreams,
    applyFilter: applyFilterFn,
    tailLines: tailLinesFn,
    buildPreview,
  });

  if (historyCompactor && typeof historyCompactor.compactIfNeeded === 'function') {
    try {
      await historyCompactor.compactIfNeeded({ history });
    } catch (error) {
      console.error(chalk.yellow('[history-compactor] Unexpected error during history compaction.'));
      console.error(error);
    }
  }

  if (typeof renderContextUsageFn === 'function') {
    try {
      const usage = summarizeContextUsage({ history, model });
      if (usage && usage.total) {
        renderContextUsageFn(usage);
      }
    } catch (error) {
      // Rendering context usage is best-effort; swallow errors to avoid interrupting the loop.
    }
  }

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
      console.log(chalk.yellow(planReminderMessage));
      history.push({ role: 'user', content: planReminderMessage });
      return true;
    }

    return false;
  }

  if (approvalManager) {
    const autoApproval = approvalManager.shouldAutoApprove(parsed.command);

    if (!autoApproval.approved) {
      const outcome = await approvalManager.requestHumanDecision({ rl, command: parsed.command });

      if (outcome.decision === 'reject') {
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
    }
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

export default {
  executeAgentPass,
};
