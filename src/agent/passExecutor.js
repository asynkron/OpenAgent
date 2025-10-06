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
  emitEvent = () => {},
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
  startThinkingFn,
  stopThinkingFn,
  escState,
  approvalManager,
  historyCompactor,
  planManager,
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
      emitEvent({
        type: 'status',
        level: 'warn',
        message: '[history-compactor] Unexpected error during history compaction.',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }

  try {
    const usage = summarizeContextUsage({ history, model });
    if (usage && usage.total) {
      emitEvent({ type: 'context-usage', usage });
    }
  } catch (error) {
    emitEvent({
      type: 'status',
      level: 'warn',
      message: 'Failed to summarize context usage.',
      details: error instanceof Error ? error.message : String(error),
    });
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
    emitEvent,
  });

  if (completionResult.status === 'canceled') {
    return false;
  }

  const { completion } = completionResult;
  const responseContent = extractResponseText(completion);

  if (!responseContent) {
    emitEvent({
      type: 'error',
      message: 'OpenAI response did not include text output.',
    });
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
    emitEvent({
      type: 'error',
      message: 'LLM returned invalid JSON.',
      details: err instanceof Error ? err.message : String(err),
      raw: responseContent,
    });

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

  emitEvent({ type: 'assistant-message', message: parsed.message ?? '' });

  const incomingPlan = Array.isArray(parsed.plan) ? parsed.plan : null;
  let activePlan = incomingPlan ?? [];

  if (planManager) {
    try {
      if (incomingPlan && typeof planManager.update === 'function') {
        const merged = await planManager.update(incomingPlan);
        if (Array.isArray(merged)) {
          activePlan = merged;
        }
      } else if (!incomingPlan && typeof planManager.get === 'function') {
        const snapshot = planManager.get();
        if (Array.isArray(snapshot)) {
          activePlan = snapshot;
        }
      }
    } catch (error) {
      emitEvent({
        type: 'status',
        level: 'warn',
        message: 'Failed to update persistent plan state.',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (!Array.isArray(activePlan)) {
    activePlan = incomingPlan ?? [];
  }

  emitEvent({ type: 'plan', plan: activePlan });

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

    if (Array.isArray(activePlan) && planHasOpenSteps(activePlan)) {
      emitEvent({
        type: 'status',
        level: 'warn',
        message: planReminderMessage,
      });
      history.push({ role: 'user', content: planReminderMessage });
      return true;
    }

    return false;
  }

  if (approvalManager) {
    const autoApproval = approvalManager.shouldAutoApprove(parsed.command);

    if (!autoApproval.approved) {
      const outcome = await approvalManager.requestHumanDecision({ command: parsed.command });

      if (outcome.decision === 'reject') {
        emitEvent({
          type: 'status',
          level: 'warn',
          message: 'Command execution canceled by human request.',
        });

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

      if (outcome.decision === 'approve_session') {
        emitEvent({
          type: 'status',
          level: 'info',
          message: 'Command approved for the remainder of the session.',
        });
      } else {
        emitEvent({
          type: 'status',
          level: 'info',
          message: 'Command approved for single execution.',
        });
      }
    } else {
      emitEvent({
        type: 'status',
        level: 'info',
        message: `Command auto-approved via ${autoApproval.source || 'policy'}.`,
      });
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
    emitEvent({
      type: 'status',
      level: 'warn',
      message: 'Failed to record command usage statistics.',
      details: error instanceof Error ? error.message : String(error),
    });
  }

  const { renderPayload, observation } = observationBuilder.build({
    command: parsed.command,
    result,
  });

  emitEvent({
    type: 'command-result',
    command: parsed.command,
    result,
    preview: renderPayload,
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
