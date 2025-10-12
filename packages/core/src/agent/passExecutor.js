import { buildPlanLookup, planHasOpenSteps, planStepIsBlocked } from '../utils/plan.js';
import { incrementCommandCount } from '../services/commandStatsService.js';
import { combineStdStreams, buildPreview } from '../utils/output.js';
import ObservationBuilder from './observationBuilder.js';
import { parseAssistantResponse } from './responseParser.js';
import { requestModelCompletion } from './openaiRequest.js';
import { executeAgentCommand } from './commandExecution.js';
import { summarizeContextUsage } from '../utils/contextUsage.js';
import { extractOpenAgentToolCall } from '../openai/responseUtils.js';
import { validateAssistantResponseSchema, validateAssistantResponse } from './responseValidator.js';
import { createChatMessageEntry } from './historyEntry.js';
import {
  createObservationHistoryEntry,
  createPlanReminderEntry,
  createRefusalAutoResponseEntry,
} from './historyMessageBuilder.js';

const REFUSAL_AUTO_RESPONSE = 'continue';
const REFUSAL_STATUS_MESSAGE =
  'Assistant declined to help; auto-responding with "continue" to prompt another attempt.';
const REFUSAL_MESSAGE_MAX_LENGTH = 160;
const PLAN_REMINDER_AUTO_RESPONSE_LIMIT = 3;
const TERMINAL_PLAN_STATUSES = new Set(['completed', 'failed', 'abandoned']);
const ensurePlanStepAge = (node) => {
  if (!node) {
    return;
  }

  if (Array.isArray(node)) {
    node.forEach(ensurePlanStepAge);
    return;
  }

  if (typeof node !== 'object') {
    return;
  }

  if (!Number.isInteger(node.age) || node.age < 0) {
    node.age = 0;
  }
};

const incrementRunningPlanStepAges = (plan) => {
  if (!Array.isArray(plan)) {
    return;
  }

  plan.forEach((step) => {
    if (!step || typeof step !== 'object') {
      return;
    }

    const status = typeof step.status === 'string' ? step.status.trim().toLowerCase() : '';
    if (status === 'running') {
      if (!Number.isInteger(step.age) || step.age < 0) {
        step.age = 0;
      }
      step.age += 1;
    }
  });
};

const REFUSAL_NEGATION_PATTERNS = [
  /\bcan['’]?t\b/i,
  /\bcannot\b/i,
  /\bunable to\b/i,
  /\bnot able to\b/i,
  /\bwon['’]?t be able to\b/i,
];

const REFUSAL_ASSISTANCE_PATTERNS = [
  /\bhelp\b/i,
  /\bassist\b/i,
  /\bcontinue\b/i, // e.g. "I can't continue with that."
];

const REFUSAL_SORRY_PATTERN = /\bsorry\b/i;

const normalizeAssistantMessage = (value) =>
  typeof value === 'string' ? value.replace(/[\u2018\u2019]/g, "'") : value;

const hasCommandPayload = (command) => {
  if (!command || typeof command !== 'object') {
    return false;
  }

  const run = typeof command.run === 'string' ? command.run.trim() : '';
  const shell = typeof command.shell === 'string' ? command.shell.trim() : '';

  return Boolean(run || shell);
};

const collectExecutablePlanSteps = (plan) => {
  const executable = [];

  if (!Array.isArray(plan)) {
    return executable;
  }

  const lookup = buildPlanLookup(plan);

  plan.forEach((item) => {
    if (!item || typeof item !== 'object') {
      return;
    }

    const status = typeof item.status === 'string' ? item.status.trim().toLowerCase() : '';
    const blocked = planStepIsBlocked(item, lookup);

    if (!blocked && !TERMINAL_PLAN_STATUSES.has(status) && hasCommandPayload(item.command)) {
      executable.push({ step: item, command: item.command });
    }
  });

  return executable;
};

const buildExecutableStepKey = (step, fallbackIndex = 0) => {
  if (!step || typeof step !== 'object') {
    return `index:${fallbackIndex}`;
  }

  const id = typeof step.id === 'string' ? step.id.trim() : '';
  if (id) {
    return `id:${id.toLowerCase()}`;
  }

  if (typeof step.title === 'string' && step.title.trim()) {
    return `title:${step.title.trim().toLowerCase()}`;
  }

  return `index:${fallbackIndex}`;
};

const getPriorityScore = (step) => {
  if (!step || typeof step !== 'object') {
    return Number.POSITIVE_INFINITY;
  }

  const numericPriority = Number(step.priority);
  if (Number.isFinite(numericPriority)) {
    return numericPriority;
  }

  return Number.POSITIVE_INFINITY;
};

const rebuildExecutableStepMap = (entries, targetMap = new Map()) => {
  targetMap.clear();
  if (!Array.isArray(entries)) {
    return targetMap;
  }

  entries.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object' || !entry.step || typeof entry.step !== 'object') {
      return;
    }

    const key = buildExecutableStepKey(entry.step, index);
    if (!targetMap.has(key)) {
      targetMap.set(key, entry.step);
    }
  });

  return targetMap;
};

const clonePlanForExecution = (plan) => {
  if (!Array.isArray(plan)) {
    return [];
  }

  return JSON.parse(JSON.stringify(plan));
};

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

  if (!REFUSAL_ASSISTANCE_PATTERNS.some((pattern) => pattern.test(lowerCased))) {
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
  onDebug = null,
  runCommandFn,
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
  emitAutoApproveStatus = false,
  planAutoResponseTracker = null,
  passIndex,
}) {
  if (typeof passIndex !== 'number') {
    throw new Error('executeAgentPass requires a numeric passIndex.');
  }

  const activePass = passIndex;
  const debugFn = typeof onDebug === 'function' ? onDebug : null;
  const emitDebug = (payloadOrFactory) => {
    if (!debugFn) {
      return;
    }

    let payload;
    try {
      payload = typeof payloadOrFactory === 'function' ? payloadOrFactory() : payloadOrFactory;
    } catch (error) {
      debugFn({
        stage: 'debug-payload-error',
        message: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    if (typeof payload === 'undefined') {
      return;
    }

    debugFn(payload);
  };

  const observationBuilder = new ObservationBuilder({
    combineStdStreams,
    applyFilter: applyFilterFn,
    tailLines: tailLinesFn,
    buildPreview,
  });

  const invokePlanManager =
    planManager && typeof planManager === 'object'
      ? (method, ...args) =>
          typeof method === 'function' ? method.call(planManager, ...args) : undefined
      : null;

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
    passIndex: activePass,
  });

  if (completionResult.status === 'canceled') {
    return false;
  }

  const { completion } = completionResult;
  const toolCall = extractOpenAgentToolCall(completion);
  const responseContent =
    toolCall && typeof toolCall.arguments === 'string' ? toolCall.arguments : '';

  emitDebug(() => ({
    stage: 'openai-response',
    toolCall,
  }));

  if (!responseContent) {
    emitEvent({
      type: 'error',
      message: 'OpenAI response did not include text output.',
    });
    return false;
  }

  history.push(
    createChatMessageEntry({
      eventType: 'chat-message',
      role: 'assistant',
      pass: activePass,
      content: responseContent,
    }),
  );

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

    history.push(createObservationHistoryEntry({ observation, pass: activePass }));
    return true;
  }

  const parsed = parseResult.value;

  const planAutoResponder =
    planAutoResponseTracker && typeof planAutoResponseTracker === 'object'
      ? planAutoResponseTracker
      : null;

  const incrementPlanReminder = () => {
    if (!planAutoResponder || typeof planAutoResponder.increment !== 'function') {
      return 1;
    }

    return planAutoResponder.increment();
  };

  const resetPlanReminder = () => {
    if (!planAutoResponder || typeof planAutoResponder.reset !== 'function') {
      return;
    }

    planAutoResponder.reset();
  };

  emitDebug(() => ({
    stage: 'assistant-response',
    parsed,
  }));

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

  const schemaValidation = validateAssistantResponseSchema(parsed);
  if (!schemaValidation.valid) {
    emitDebug(() => ({
      stage: 'assistant-response-schema-validation-error',
      message: 'Assistant response failed schema validation.',
      errors: schemaValidation.errors,
      raw: responseContent,
    }));

    emitEvent({
      type: 'schema_validation_failed',
      message: 'Assistant response failed schema validation.',
      errors: schemaValidation.errors,
      raw: responseContent,
    });

    const schemaMessages = schemaValidation.errors.map(
      (error) => `${error.path}: ${error.message}`,
    );
    let summaryMessage;
    if (schemaMessages.length === 1) {
      summaryMessage = `Schema validation failed: ${schemaMessages[0]}`;
    } else {
      summaryMessage =
        'Schema validation failed. Please address the following issues:\n- ' +
        schemaMessages.join('\n- ');
    }

    const observation = {
      observation_for_llm: {
        schema_validation_error: true,
        message: summaryMessage,
        details: schemaMessages,
        response_snippet: responseContent.slice(0, 4000),
      },
      observation_metadata: {
        timestamp: new Date().toISOString(),
      },
    };

    history.push(createObservationHistoryEntry({ observation, pass: activePass }));
    return true;
  }

  const validation = validateAssistantResponse(parsed);
  if (!validation.valid) {
    const details = validation.errors.join(' ');
    emitDebug(() => ({
      // Surface validation failures on the debug channel so the default CLI stream stays quiet.
      stage: 'assistant-response-validation-error',
      message: 'Assistant response failed protocol validation.',
      details,
      errors: validation.errors,
      raw: responseContent,
    }));

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

    history.push(createObservationHistoryEntry({ observation, pass: activePass }));
    return true;
  }

  emitEvent({ type: 'assistant-message', message: parsed.message ?? '' });

  const incomingPlan = Array.isArray(parsed.plan) ? parsed.plan : null;
  let activePlan = incomingPlan ?? [];

  if (planManager) {
    try {
      const mergePreference = await invokePlanManager?.(planManager.isMergingEnabled);
      const shouldMerge = mergePreference !== false;

      if (incomingPlan) {
        const updated = await invokePlanManager?.(planManager.update, incomingPlan);
        if (Array.isArray(updated)) {
          activePlan = updated;
        }
      } else if (shouldMerge) {
        const snapshot = await invokePlanManager?.(planManager.get);
        if (Array.isArray(snapshot)) {
          activePlan = snapshot;
        }
      } else {
        const cleared = await invokePlanManager?.(planManager.reset);
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

  ensurePlanStepAge(activePlan);
  incrementRunningPlanStepAges(activePlan);

  emitEvent({ type: 'plan', plan: clonePlanForExecution(activePlan) });

  const persistPlanState = async (planSnapshot) => {
    if (!planSnapshot || !Array.isArray(planSnapshot) || !invokePlanManager) {
      return false;
    }

    try {
      let persisted;
      if (typeof planManager?.sync === 'function') {
        persisted = await invokePlanManager(planManager.sync, planSnapshot);
      } else if (typeof planManager?.update === 'function') {
        persisted = await invokePlanManager(planManager.update, planSnapshot);
      }

      if (Array.isArray(persisted)) {
        activePlan = persisted;
        return true;
      }
    } catch (error) {
      emitEvent({
        type: 'status',
        level: 'warn',
        message: 'Failed to persist plan state after execution.',
        details: error instanceof Error ? error.message : String(error),
      });
    }

    return false;
  };

  const planForExecution = clonePlanForExecution(activePlan);
  let activePlanExecutableSteps = collectExecutablePlanSteps(activePlan);
  const activePlanStepMap = rebuildExecutableStepMap(activePlanExecutableSteps, new Map());
  let planMutatedDuringExecution = false;

  const selectNextExecutableEntry = () => {
    const candidates = collectExecutablePlanSteps(planForExecution).map((entry, index) => ({
      ...entry,
      index,
      key: buildExecutableStepKey(entry.step, index),
      priority: getPriorityScore(entry.step),
    }));

    if (candidates.length === 0) {
      return null;
    }

    candidates.sort((a, b) => {
      if (a.priority === b.priority) {
        return a.index - b.index;
      }

      return a.priority - b.priority;
    });

    return candidates[0] ?? null;
  };

  const refreshActivePlanExecutableSteps = () => {
    activePlanExecutableSteps = collectExecutablePlanSteps(activePlan);
    rebuildExecutableStepMap(activePlanExecutableSteps, activePlanStepMap);
  };

  refreshActivePlanExecutableSteps();

  let nextExecutable = selectNextExecutableEntry();

  if (!nextExecutable) {
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

    if (activePlanEmpty && incomingPlanEmpty && isLikelyRefusalMessage(normalizedMessage)) {
      // When the assistant refuses without offering a plan or command, nudge it forward automatically.
      emitEvent({ type: 'status', level: 'info', message: REFUSAL_STATUS_MESSAGE });
      history.push(
        createRefusalAutoResponseEntry({
          autoResponseMessage: REFUSAL_AUTO_RESPONSE,
          pass: activePass,
        }),
      );
      resetPlanReminder();
      return true;
    }

    const hasOpenSteps = Array.isArray(activePlan) && activePlan.length > 0 && planHasOpenSteps(activePlan);

    if (hasOpenSteps) {
      const attempt = incrementPlanReminder();

      if (attempt <= PLAN_REMINDER_AUTO_RESPONSE_LIMIT) {
        emitEvent({
          type: 'status',
          level: 'warn',
          message: planReminderMessage,
        });
        history.push(createPlanReminderEntry({ planReminderMessage, pass: activePass }));
        return true;
      }

      return false;
    }

    if (!activePlanEmpty && !hasOpenSteps) {
      // The plan is finished; wipe the snapshot so follow-up prompts start cleanly.
      if (invokePlanManager) {
        try {
          const cleared = await invokePlanManager(planManager.reset);
          if (Array.isArray(cleared)) {
            activePlan = cleared;
          } else {
            activePlan = [];
          }
        } catch (error) {
          emitEvent({
            type: 'status',
            level: 'warn',
            message: 'Failed to clear persistent plan state after completion.',
            details: error instanceof Error ? error.message : String(error),
          });
          activePlan = [];
        }
      } else {
        activePlan = [];
      }

      emitEvent({ type: 'plan', plan: clonePlanForExecution(activePlan) });
    }

    resetPlanReminder();
    return false;
  }

  resetPlanReminder();

  while (nextExecutable) {
    const { step, command, index: snapshotIndex, key: stepKey } = nextExecutable;
    let activePlanStep = activePlanStepMap.get(stepKey) ?? null;

    if (
      !activePlanStep &&
      Array.isArray(activePlanExecutableSteps) &&
      snapshotIndex < activePlanExecutableSteps.length
    ) {
      activePlanStep = activePlanExecutableSteps[snapshotIndex]?.step ?? null;
    }

    const normalizedRun = typeof command.run === 'string' ? command.run.trim() : '';
    if (normalizedRun && command.run !== normalizedRun) {
      command.run = normalizedRun;
    }

    if (approvalManager) {
      const autoApproval = approvalManager.shouldAutoApprove(command);

      if (!autoApproval.approved) {
        const outcome = await approvalManager.requestHumanDecision({ command });

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

          step.observation = observation;

          const planObservation = {
            observation_for_llm: {
              plan: planForExecution,
            },
            observation_metadata: {
              timestamp: new Date().toISOString(),
            },
          };

          history.push(
            createObservationHistoryEntry({ observation: planObservation, pass: activePass }),
          );
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
      } else if (autoApproval.source === 'flag' && emitAutoApproveStatus) {
        emitEvent({
          type: 'status',
          level: 'info',
          message: 'Command auto-approved via flag.',
        });
      }
    }

    if (activePlanStep && typeof activePlanStep === 'object') {
      // Surface that execution has started even if the model forgot to update the status.
      activePlanStep.status = 'running';
      planMutatedDuringExecution = true;
    }

    if (step && typeof step === 'object') {
      step.status = 'running';
    }

    if (Array.isArray(activePlan)) {
      emitEvent({ type: 'plan', plan: clonePlanForExecution(activePlan) });
    }

    const persistedBeforeExecution = await persistPlanState(activePlan);
    planMutatedDuringExecution ||= persistedBeforeExecution;
    refreshActivePlanExecutableSteps();
    activePlanStep = activePlanStepMap.get(stepKey) ?? activePlanStep;
    if (
      !activePlanStep &&
      Array.isArray(activePlanExecutableSteps) &&
      snapshotIndex < activePlanExecutableSteps.length
    ) {
      activePlanStep = activePlanExecutableSteps[snapshotIndex]?.step ?? activePlanStep;
    }

    const { result, executionDetails } = await executeAgentCommand({
      command,
      runCommandFn,
    });

    let key = typeof command.key === 'string' && command.key.trim() ? command.key.trim() : '';
    if (!key) {
      key = normalizedRun ? normalizedRun.split(/\s+/)[0] || 'unknown' : 'unknown';
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
      command,
      result,
    });

    step.observation = observation;
    if (activePlanStep && typeof activePlanStep === 'object') {
      activePlanStep.observation = observation;
      planMutatedDuringExecution = true;
    }

    const exitCode =
      typeof result?.exit_code === 'number'
        ? result.exit_code
        : typeof result?.exitCode === 'number'
          ? result.exitCode
          : null;
    if (exitCode === 0) {
      if (activePlanStep && typeof activePlanStep === 'object') {
        activePlanStep.status = 'completed';
        planMutatedDuringExecution = true;
      }
      if (step && typeof step === 'object') {
        step.status = 'completed';
      }
    } else if (exitCode !== null) {
      if (activePlanStep && typeof activePlanStep === 'object') {
        activePlanStep.status = 'failed';
        planMutatedDuringExecution = true;
      }
      if (step && typeof step === 'object') {
        step.status = 'failed';
      }
    }

    if (result && result.killed) {
      // When a command is canceled we drop the executable payload so the agent
      // waits for the model to acknowledge the interruption instead of
      // immediately retrying the same command in a tight loop.
      if (activePlanStep && typeof activePlanStep === 'object') {
        delete activePlanStep.command;
        planMutatedDuringExecution = true;
      }
      if (step && typeof step === 'object') {
        delete step.command;
      }
    }

    emitDebug(() => ({
      stage: 'command-execution',
      command,
      result,
      execution: executionDetails,
      observation,
    }));

    emitEvent({
      type: 'command-result',
      command,
      result,
      preview: renderPayload,
      execution: executionDetails,
    });

    if (Array.isArray(activePlan)) {
      emitEvent({ type: 'plan', plan: clonePlanForExecution(activePlan) });
    }

    const persistedAfterExecution = await persistPlanState(activePlan);
    planMutatedDuringExecution ||= persistedAfterExecution;
    refreshActivePlanExecutableSteps();

    nextExecutable = selectNextExecutableEntry();
  }

  if (planMutatedDuringExecution && Array.isArray(activePlan)) {
    emitEvent({ type: 'plan', plan: clonePlanForExecution(activePlan) });
  }

  const planObservation = {
    observation_for_llm: {
      plan: planForExecution,
    },
    observation_metadata: {
      timestamp: new Date().toISOString(),
    },
  };

  emitDebug(() => ({
    stage: 'plan-observation',
    plan: planForExecution,
  }));

  history.push(createObservationHistoryEntry({ observation: planObservation, pass: activePass }));

  return true;
}

export default {
  executeAgentPass,
};
