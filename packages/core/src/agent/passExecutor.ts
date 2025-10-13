import { planHasOpenSteps } from '../utils/plan.js';
import { incrementCommandCount as defaultIncrementCommandCount } from '../services/commandStatsService.js';
import {
  combineStdStreams as defaultCombineStdStreams,
  buildPreview as defaultBuildPreview,
} from '../utils/output.js';
import ObservationBuilder, { type ObservationBuilderDeps } from './observationBuilder.js';
import { parseAssistantResponse as defaultParseAssistantResponse } from './responseParser.js';
import { requestModelCompletion as defaultRequestModelCompletion } from './openaiRequest.js';
import { executeAgentCommand as defaultExecuteAgentCommand } from './commandExecution.js';
import { summarizeContextUsage as defaultSummarizeContextUsage } from '../utils/contextUsage.js';
import { extractOpenAgentToolCall as defaultExtractOpenAgentToolCall } from '../openai/responseUtils.js';
import {
  validateAssistantResponseSchema as defaultValidateAssistantResponseSchema,
  validateAssistantResponse as defaultValidateAssistantResponse,
} from './responseValidator.js';
import {
  createChatMessageEntry as defaultCreateChatMessageEntry,
  type ChatMessageEntry,
} from './historyEntry.js';
import type { ResponsesClient } from '../openai/responses.js';
import {
  createObservationHistoryEntry,
  createPlanReminderEntry,
  createRefusalAutoResponseEntry,
} from './historyMessageBuilder.js';
import type { EscState } from './escState.js';
import type { AgentCommandContext } from './commandExecution.js';
import type { ApprovalManager } from './approvalManager.js';
import type { HistoryCompactor } from './historyCompactor.js';
import {
  clonePlanForExecution,
  collectExecutablePlanSteps,
  ensurePlanStepAge,
  getPriorityScore,
  incrementRunningPlanStepAges,
  type PlanStep,
  type ExecutablePlanStep,
} from './passExecutor/planExecution.js';
import { refusalHeuristics } from './passExecutor/refusalDetection.js';
import {
  guardRequestPayloadSize,
  compactHistoryIfNeeded,
  emitContextUsageSummary,
  requestAssistantCompletion,
  type CompletionAttempt,
  type EmitEvent,
} from './passExecutor/prePassTasks.js';

type UnknownRecord = Record<string, unknown>;

interface PlanAutoResponseTracker {
  increment: () => number;
  reset: () => void;
  getCount?: () => number;
}

interface PlanManagerLike {
  isMergingEnabled?: () => boolean | Promise<boolean>;
  update?: (plan: PlanStep[] | null | undefined) => Promise<unknown>;
  get?: () => unknown;
  reset?: () => Promise<unknown>;
  sync?: (plan: PlanStep[] | null | undefined) => Promise<unknown>;
}

type PlanManagerMethod = ((plan?: PlanStep[] | null | undefined) => unknown) | null | undefined;

const createPlanManagerInvoker =
  (manager: PlanManagerLike) =>
  (method: PlanManagerMethod, plan?: PlanStep[] | null | undefined): unknown => {
    if (typeof method !== 'function') {
      return undefined;
    }

    // Passing an explicit plan argument keeps TypeScript satisfied while still
    // allowing zero-argument plan manager methods to ignore it at runtime.
    return method.call(manager, plan);
  };

interface ExecutableCandidate extends ExecutablePlanStep {
  index: number;
  priority: number;
}

const PLAN_REMINDER_AUTO_RESPONSE_LIMIT = 3;

interface PlanReminderController {
  recordAttempt: () => number;
  reset: () => void;
  getCount: () => number;
}

const createPlanReminderController = (
  tracker: PlanAutoResponseTracker | null | undefined,
): PlanReminderController => {
  if (tracker && typeof tracker.increment === 'function' && typeof tracker.reset === 'function') {
    return {
      recordAttempt: () => tracker.increment(),
      reset: () => tracker.reset(),
      getCount: () => (typeof tracker.getCount === 'function' ? (tracker.getCount() ?? 0) : 0),
    };
  }

  // Fallback tracker keeps local state so the reminder limit still applies even when
  // the caller does not provide a dedicated tracker implementation.
  let fallbackCount = 0;
  return {
    recordAttempt: () => {
      fallbackCount += 1;
      return fallbackCount;
    },
    reset: () => {
      fallbackCount = 0;
    },
    getCount: () => fallbackCount,
  };
};

const pickNextExecutableCandidate = (entries: ExecutablePlanStep[]): ExecutableCandidate | null => {
  let best: ExecutableCandidate | null = null;

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const candidate: ExecutableCandidate = {
      ...entry,
      index,
      priority: getPriorityScore(entry.step),
    };

    if (!best) {
      best = candidate;
      continue;
    }

    if (candidate.priority < best.priority) {
      best = candidate;
      continue;
    }

    if (candidate.priority === best.priority && candidate.index < best.index) {
      best = candidate;
    }
  }

  return best;
};

const normalizeAssistantMessage = (value: unknown): string =>
  typeof value === 'string' ? value.replace(/[\u2018\u2019]/g, "'") : '';
// Quick heuristic to detect short apology-style refusals so we can auto-nudge the model.
const isLikelyRefusalMessage = (message: unknown): boolean =>
  refusalHeuristics.isLikelyRefusalMessage(message);

export interface ExecuteAgentPassOptions {
  openai: ResponsesClient;
  model: string;
  history: ChatMessageEntry[];
  emitEvent?: (event: UnknownRecord) => void;
  onDebug?: ((payload: UnknownRecord) => void) | null;
  runCommandFn: AgentCommandContext['runCommandFn'];
  applyFilterFn: (text: string, regex: string) => string;
  tailLinesFn: (text: string, lines: number) => string;
  getNoHumanFlag?: () => boolean;
  setNoHumanFlag?: (value: boolean) => void;
  planReminderMessage: string;
  startThinkingFn: () => void;
  stopThinkingFn: () => void;
  escState: EscState | null;
  approvalManager: ApprovalManager | null;
  historyCompactor: HistoryCompactor | null;
  planManager: PlanManagerLike | null;
  emitAutoApproveStatus?: boolean;
  planAutoResponseTracker?: PlanAutoResponseTracker | null;
  passIndex: number;
  requestModelCompletionFn?: typeof defaultRequestModelCompletion;
  executeAgentCommandFn?: typeof defaultExecuteAgentCommand;
  createObservationBuilderFn?: (deps: ObservationBuilderDeps) => ObservationBuilder;
  combineStdStreamsFn?: ObservationBuilderDeps['combineStdStreams'];
  buildPreviewFn?: ObservationBuilderDeps['buildPreview'];
  parseAssistantResponseFn?: typeof defaultParseAssistantResponse;
  validateAssistantResponseSchemaFn?: typeof defaultValidateAssistantResponseSchema;
  validateAssistantResponseFn?: typeof defaultValidateAssistantResponse;
  createChatMessageEntryFn?: typeof defaultCreateChatMessageEntry;
  extractOpenAgentToolCallFn?: typeof defaultExtractOpenAgentToolCall;
  summarizeContextUsageFn?: typeof defaultSummarizeContextUsage;
  incrementCommandCountFn?: typeof defaultIncrementCommandCount;
  guardRequestPayloadSizeFn?:
    | ((options: {
        history: ChatMessageEntry[];
        model: string;
        passIndex: number;
      }) => Promise<void>)
    | null;
}

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
  // New DI hooks (all optional, defaults preserve current behaviour)
  requestModelCompletionFn = defaultRequestModelCompletion,
  executeAgentCommandFn = defaultExecuteAgentCommand,
  createObservationBuilderFn = (deps) => new ObservationBuilder(deps),
  combineStdStreamsFn = (stdout, stderr, exitCode) =>
    // Normalize optional exit codes before delegating so ObservationBuilder sees a consistent signature.
    defaultCombineStdStreams(stdout, stderr, exitCode ?? 0),
  buildPreviewFn = (text) => defaultBuildPreview(text),
  parseAssistantResponseFn = defaultParseAssistantResponse,
  validateAssistantResponseSchemaFn = defaultValidateAssistantResponseSchema,
  validateAssistantResponseFn = defaultValidateAssistantResponse,
  createChatMessageEntryFn = defaultCreateChatMessageEntry,
  extractOpenAgentToolCallFn = defaultExtractOpenAgentToolCall,
  summarizeContextUsageFn = defaultSummarizeContextUsage,
  incrementCommandCountFn = defaultIncrementCommandCount,
  guardRequestPayloadSizeFn = null,
}: ExecuteAgentPassOptions): Promise<boolean> {
  if (typeof passIndex !== 'number') {
    throw new Error('executeAgentPass requires a numeric passIndex.');
  }

  const activePass = passIndex;
  const debugFn = typeof onDebug === 'function' ? onDebug : null;
  const emitDebug = (payloadOrFactory: unknown): void => {
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

  const observationBuilder = createObservationBuilderFn({
    combineStdStreams: combineStdStreamsFn,
    applyFilter: applyFilterFn,
    tailLines: tailLinesFn,
    buildPreview: buildPreviewFn,
  });

  const invokePlanManager =
    planManager && typeof planManager === 'object' ? createPlanManagerInvoker(planManager) : null;

  await guardRequestPayloadSize({
    guardRequestPayloadSizeFn,
    history,
    model,
    passIndex: activePass,
    emitEvent,
  });

  await compactHistoryIfNeeded({ historyCompactor, history, emitEvent });

  emitContextUsageSummary({
    summarizeContextUsageFn,
    history,
    model,
    emitEvent,
  });

  const completionAttempt = await requestAssistantCompletion({
    requestModelCompletionFn,
    extractOpenAgentToolCallFn,
    createChatMessageEntryFn,
    emitDebug,
    emitEvent,
    observationBuilder,
    openai,
    model,
    history,
    escState,
    startThinkingFn,
    stopThinkingFn,
    setNoHumanFlag,
    passIndex: activePass,
  });

  if (completionAttempt.status === 'canceled') {
    return false;
  }

  if (completionAttempt.status === 'missing-content') {
    return false;
  }

  const responseContent = completionAttempt.responseContent;
  const parseResult = parseAssistantResponseFn(responseContent);

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

  const planReminder = createPlanReminderController(planAutoResponseTracker);

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

  const schemaValidation = validateAssistantResponseSchemaFn(parsed);
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

  const validation = validateAssistantResponseFn(parsed);
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

  const incomingPlan: PlanStep[] | null = Array.isArray(parsed.plan)
    ? (parsed.plan as PlanStep[])
    : null;
  let activePlan: PlanStep[] = incomingPlan ?? [];

  if (planManager) {
    try {
      // The plan manager is only consulted when the model sends a fresh plan payload.
      // We let it merge new steps/tasks from the assistant response but avoid using it
      // for post-execution persistence so local status updates stay in memory only.
      const mergePreference = await invokePlanManager?.(planManager.isMergingEnabled);
      const shouldMerge = mergePreference !== false;

      if (incomingPlan) {
        const updated = await invokePlanManager?.(planManager.update, incomingPlan);
        if (Array.isArray(updated)) {
          activePlan = updated as PlanStep[];
        }
      } else if (shouldMerge) {
        const snapshot = await invokePlanManager?.(planManager.get);
        if (Array.isArray(snapshot)) {
          activePlan = snapshot as PlanStep[];
        }
      } else {
        const cleared = await invokePlanManager?.(planManager.reset);
        if (Array.isArray(cleared)) {
          activePlan = cleared as PlanStep[];
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

  let planMutatedDuringExecution = false;

  const selectNextExecutableEntry = (): ExecutableCandidate | null =>
    pickNextExecutableCandidate(collectExecutablePlanSteps(activePlan));

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
      emitEvent({ type: 'status', level: 'info', message: refusalHeuristics.statusMessage });
      history.push(
        createRefusalAutoResponseEntry({
          autoResponseMessage: refusalHeuristics.autoResponse,
          pass: activePass,
        }),
      );
      planReminder.reset();
      return true;
    }

    const hasOpenSteps =
      Array.isArray(activePlan) && activePlan.length > 0 && planHasOpenSteps(activePlan);

    if (hasOpenSteps) {
      const attempt = planReminder.recordAttempt();

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
      if (planManager && invokePlanManager) {
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

    planReminder.reset();
    return false;
  }

  planReminder.reset();

  const manageCommandThinking =
    Boolean(nextExecutable) &&
    typeof startThinkingFn === 'function' &&
    typeof stopThinkingFn === 'function';

  if (manageCommandThinking) {
    startThinkingFn();
  }

  try {
    while (nextExecutable) {
      const { step, command } = nextExecutable;

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
                plan: clonePlanForExecution(activePlan),
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

      const planStep = step && typeof step === 'object' ? step : null;

      if (planStep) {
        // Surface that execution has started even if the model forgot to update the status.
        planStep.status = 'running';
        planMutatedDuringExecution = true;
      }

      if (Array.isArray(activePlan)) {
        emitEvent({ type: 'plan', plan: clonePlanForExecution(activePlan) });
      }

      let commandResult;
      let executionDetails;

      try {
        ({ result: commandResult, executionDetails } = await executeAgentCommandFn({
          command,
          runCommandFn,
        }));
      } catch (error) {
        const normalizedError =
          error instanceof Error
            ? error
            : new Error(typeof error === 'string' ? error : String(error));

        emitEvent({
          type: 'status',
          level: 'error',
          message: 'Command execution threw an exception.',
          details: normalizedError.stack || normalizedError.message,
        });

        commandResult = {
          stdout: '',
          stderr: normalizedError.message,
          exit_code: 1,
          killed: false,
          runtime_ms: 0,
        };

        executionDetails = {
          type: 'EXECUTE',
          command,
          error: {
            message: normalizedError.message,
            stack: normalizedError.stack,
          },
        };
      }

      let key = typeof command.key === 'string' && command.key.trim() ? command.key.trim() : '';
      if (!key) {
        key = normalizedRun ? normalizedRun.split(/\s+/)[0] || 'unknown' : 'unknown';
      }

      try {
        await incrementCommandCountFn(key);
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
        result: commandResult,
      });

      if (planStep) {
        planStep.observation = observation;
        planMutatedDuringExecution = true;
      }

      const exitCode =
        typeof commandResult?.exit_code === 'number'
          ? commandResult.exit_code
          : typeof commandResult?.exitCode === 'number'
            ? commandResult.exitCode
            : null;
      if (exitCode === 0) {
        if (planStep) {
          planStep.status = 'completed';
          planMutatedDuringExecution = true;
        }
      } else if (exitCode !== null) {
        if (planStep) {
          planStep.status = 'failed';
          planMutatedDuringExecution = true;
        }
      }

      if (commandResult && commandResult.killed) {
        // When a command is canceled we drop the executable payload so the agent
        // waits for the model to acknowledge the interruption instead of
        // immediately retrying the same command in a tight loop.
        if (planStep) {
          delete planStep.command;
          planMutatedDuringExecution = true;
        }
      }

      emitDebug(() => ({
        stage: 'command-execution',
        command,
        result: commandResult,
        execution: executionDetails,
        observation,
      }));

      emitEvent({
        type: 'command-result',
        command,
        result: commandResult,
        preview: renderPayload,
        execution: executionDetails,
      });

      if (Array.isArray(activePlan)) {
        emitEvent({ type: 'plan', plan: clonePlanForExecution(activePlan) });
      }

      nextExecutable = selectNextExecutableEntry();
    }
  } finally {
    if (manageCommandThinking) {
      stopThinkingFn();
    }
  }

  if (planMutatedDuringExecution && Array.isArray(activePlan)) {
    emitEvent({ type: 'plan', plan: clonePlanForExecution(activePlan) });

    if (planManager && invokePlanManager && typeof planManager.sync === 'function') {
      try {
        await invokePlanManager(planManager.sync, activePlan);
      } catch (error) {
        emitEvent({
          type: 'status',
          level: 'warn',
          message: 'Failed to persist plan state after execution.',
          details: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const planSnapshot = clonePlanForExecution(activePlan);
    const planObservation = {
      observation_for_llm: {
        plan: planSnapshot,
      },
      observation_metadata: {
        timestamp: new Date().toISOString(),
      },
    };

    emitDebug(() => ({
      stage: 'plan-observation',
      plan: planSnapshot,
    }));

    history.push(createObservationHistoryEntry({ observation: planObservation, pass: activePass }));
  }

  return true;
}

export default {
  executeAgentPass,
};
