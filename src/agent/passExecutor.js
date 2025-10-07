import { planHasOpenSteps } from '../utils/plan.js';
import { incrementCommandCount } from '../commands/commandStats.js';
import { combineStdStreams, buildPreview } from '../utils/output.js';
import ObservationBuilder from './observationBuilder.js';
import { parseAssistantResponse } from './responseParser.js';
import { requestModelCompletion } from './openaiRequest.js';
import { executeAgentCommand } from './commandExecution.js';
import { summarizeContextUsage } from '../utils/contextUsage.js';
import { extractResponseText } from '../openai/responseUtils.js';
import { validateAssistantResponse } from './responseValidator.js';

const REFUSAL_AUTO_RESPONSE = 'continue';
const REFUSAL_STATUS_MESSAGE =
  'Assistant declined to help; auto-responding with "continue" to prompt another attempt.';
const REFUSAL_MESSAGE_MAX_LENGTH = 160;

const REFUSAL_NEGATION_PATTERNS = [
  /\bcan['’]?t\b/i,
  /\bcannot\b/i,
  /\bunable to\b/i,
  /\bnot able to\b/i,
  /\bwon['’]?t be able to\b/i,
];

const REFUSAL_HELP_PATTERNS = [/\bhelp\b/i, /\bassist\b/i];

const REFUSAL_SORRY_PATTERN = /\bsorry\b/i;

const normalizeAssistantMessage = (value) =>
  typeof value === 'string' ? value.replace(/[\u2018\u2019]/g, "'") : value;

// Quick heuristic to detect short apology-style refusals so we can auto-nudge the model.
const isLikelyRefusalMessage = (message) => {
  if (typeof message !== 'string') {
    return false;
  }

  const normalized = normalizeAssistantMessage(message).trim();

  if (!normalized || normalized.length > REFUSAL_MESSAGE_MAX_LENGTH) {
    return false;
  }

  const lowerCased = normalized.toLowerCase();

  if (!REFUSAL_SORRY_PATTERN.test(lowerCased)) {
    return false;
  }

  if (!REFUSAL_HELP_PATTERNS.some((pattern) => pattern.test(lowerCased))) {
    return false;
  }

  if (!REFUSAL_NEGATION_PATTERNS.some((pattern) => pattern.test(lowerCased))) {
    return false;
  }

  return true;
};

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

  const parseResult = parseAssistantResponse(responseContent);

  if (!parseResult.ok) {
    const attempts = Array.isArray(parseResult.attempts)
      ? parseResult.attempts.map(({ strategy, error }) => ({
          strategy,
          message: error instanceof Error ? error.message : String(error),
        }))
      : [];

    emitEvent({
      type: 'error',
      message: 'LLM returned invalid JSON.',
      details:
        parseResult.error instanceof Error
          ? parseResult.error.message
          : String(parseResult.error ?? 'Unknown error'),
      raw: responseContent,
      attempts,
    });

    const observation = {
      observation_for_llm: {
        json_parse_error: true,
        message:
          'Failed to parse assistant JSON response. Please resend a valid JSON object that follows the CLI protocol.',
        attempts,
        response_snippet: responseContent.slice(0, 4000),
      },
      observation_metadata: {
        timestamp: new Date().toISOString(),
      },
    };

    history.push({ role: 'user', content: JSON.stringify(observation) });
    return true;
  }

  const parsed = parseResult.value;

  if (
    parseResult.recovery &&
    parseResult.recovery.strategy &&
    parseResult.recovery.strategy !== 'direct'
  ) {
    emitEvent({
      type: 'status',
      level: 'info',
      message: `Assistant JSON parsed after applying ${parseResult.recovery.strategy.replace(/_/g, ' ')} recovery.`,
    });
  }

  const validation = validateAssistantResponse(parsed);
  if (!validation.valid) {
    const details = validation.errors.join(' ');
    emitEvent({
      type: 'error',
      message: 'Assistant response failed protocol validation.',
      details,
      raw: responseContent,
    });

    const observation = {
      observation_for_llm: {
        response_validation_error: true,
        message:
          validation.errors.length === 1
            ? validation.errors[0]
            : `Detected ${validation.errors.length} validation issues. Please fix them and resend a compliant response.`,
        details: validation.errors,
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
      const mergingEnabled =
        typeof planManager.isMergingEnabled === 'function' ? planManager.isMergingEnabled() : true;

      if (incomingPlan && typeof planManager.update === 'function') {
        const updated = await planManager.update(incomingPlan);
        if (Array.isArray(updated)) {
          activePlan = updated;
        }
      } else if (!incomingPlan && mergingEnabled && typeof planManager.get === 'function') {
        const snapshot = planManager.get();
        if (Array.isArray(snapshot)) {
          activePlan = snapshot;
        }
      } else if (!incomingPlan && !mergingEnabled && typeof planManager.reset === 'function') {
        const cleared = await planManager.reset();
        if (Array.isArray(cleared)) {
          activePlan = cleared;
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

    const trimmedMessage = typeof parsed.message === 'string' ? parsed.message.trim() : '';
    const normalizedMessage = normalizeAssistantMessage(trimmedMessage);
    const activePlanEmpty = !Array.isArray(activePlan) || activePlan.length === 0;
    const incomingPlanEmpty = !Array.isArray(incomingPlan) || incomingPlan.length === 0;

    if (
      activePlanEmpty &&
      incomingPlanEmpty &&
      isLikelyRefusalMessage(normalizedMessage)
    ) {
      // When the assistant refuses without offering a plan or command, nudge it forward automatically.
      emitEvent({ type: 'status', level: 'info', message: REFUSAL_STATUS_MESSAGE });
      history.push({ role: 'user', content: REFUSAL_AUTO_RESPONSE });
      return true;
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
