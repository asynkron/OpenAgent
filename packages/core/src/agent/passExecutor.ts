import { incrementCommandCount as defaultIncrementCommandCount } from '../services/commandStatsService.js';
import {
  combineStdStreams as defaultCombineStdStreams,
  buildPreview as defaultBuildPreview,
} from '../utils/output.js';
import ObservationBuilder from './observationBuilder.js';
import { parseAssistantResponse as defaultParseAssistantResponse } from './responseParser.js';
import { requestModelCompletion as defaultRequestModelCompletion } from './openaiRequest.js';
import { executeAgentCommand as defaultExecuteAgentCommand } from './commandExecution.js';
import { summarizeContextUsage as defaultSummarizeContextUsage } from '../utils/contextUsage.js';
import { extractOpenAgentToolCall as defaultExtractOpenAgentToolCall } from '../openai/responseUtils.js';
import {
  validateAssistantResponseSchema as defaultValidateAssistantResponseSchema,
  validateAssistantResponse as defaultValidateAssistantResponse,
} from './responseValidator.js';
import { createChatMessageEntry as defaultCreateChatMessageEntry } from './historyEntry.js';
import {
  guardRequestPayloadSize,
  compactHistoryIfNeeded,
  emitContextUsageSummary,
  requestAssistantCompletion,
} from './passExecutor/prePassTasks.js';
import { createPlanManagerAdapter } from './passExecutor/planManagerAdapter.js';
import { createDebugEmitter } from './passExecutor/debugEmitter.js';
import { evaluateAssistantResponse } from './passExecutor/assistantResponse.js';
import { PlanRuntime } from './passExecutor/planRuntime.js';
import { createCommandRuntime } from './passExecutor/commandRuntime.js';
import type { ExecutableCandidate } from './passExecutor/planRuntime.js';
import type { PlanStep } from './passExecutor/planExecution.js';
import type { PlanManagerAdapter } from './passExecutor/planManagerAdapter.js';
import type { ExecuteAgentPassOptions } from './passExecutor/types.js';

export type { ExecuteAgentPassOptions } from './passExecutor/types.js';

export async function executeAgentPass(options: ExecuteAgentPassOptions): Promise<boolean> {
  const {
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
    requestModelCompletionFn = defaultRequestModelCompletion,
    executeAgentCommandFn = defaultExecuteAgentCommand,
    createObservationBuilderFn = (deps) => new ObservationBuilder(deps),
    combineStdStreamsFn = (stdout, stderr, exitCode) =>
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
  } = options;

  if (typeof passIndex !== 'number') {
    throw new Error('executeAgentPass requires a numeric passIndex.');
  }

  const debugEmitter = createDebugEmitter(onDebug);

  const observationBuilder = createObservationBuilderFn({
    combineStdStreams: combineStdStreamsFn,
    applyFilter: applyFilterFn,
    tailLines: tailLinesFn,
    buildPreview: buildPreviewFn,
  });

  const planManagerAdapter: PlanManagerAdapter | null = createPlanManagerAdapter(planManager);

  await guardRequestPayloadSize({
    guardRequestPayloadSizeFn,
    history,
    model,
    passIndex,
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
    emitDebug: debugEmitter.emit,
    emitEvent,
    observationBuilder,
    openai,
    model,
    history,
    escState,
    startThinkingFn,
    stopThinkingFn,
    setNoHumanFlag,
    passIndex,
  });

  if (completionAttempt.status === 'canceled') {
    return false;
  }

  if (completionAttempt.status === 'missing-content') {
    return false;
  }

  const responseResolution = evaluateAssistantResponse({
    responseContent: completionAttempt.responseContent,
    history,
    passIndex,
    emitEvent,
    emitDebug: debugEmitter.emit,
    parseAssistantResponseFn,
    validateAssistantResponseSchemaFn,
    validateAssistantResponseFn,
  });

  if (responseResolution.status !== 'success') {
    return true;
  }

  emitEvent({ type: 'assistant-message', message: responseResolution.parsed.message ?? '' });

  const incomingPlan: PlanStep[] | null = Array.isArray(responseResolution.parsed.plan)
    ? (responseResolution.parsed.plan as PlanStep[])
    : null;

  const planRuntime = new PlanRuntime({
    history,
    passIndex,
    emitEvent,
    planReminderMessage,
    planManager: planManagerAdapter,
    planAutoResponseTracker,
    getNoHumanFlag,
    setNoHumanFlag,
  });

  await planRuntime.initialize(incomingPlan);

  let nextExecutable: ExecutableCandidate | null = planRuntime.selectNextExecutableEntry();

  if (!nextExecutable) {
    const assistantMessage =
      typeof responseResolution.parsed.message === 'string'
        ? responseResolution.parsed.message
        : '';
    const outcome = await planRuntime.handleNoExecutable({ parsedMessage: assistantMessage });
    return outcome === 'continue';
  }

  planRuntime.resetPlanReminder();

  const manageCommandThinking =
    typeof startThinkingFn === 'function' && typeof stopThinkingFn === 'function';

  if (manageCommandThinking) {
    startThinkingFn();
  }

  const commandRuntime = createCommandRuntime({
    approvalManager,
    emitEvent,
    emitAutoApproveStatus,
    runCommandFn,
    executeAgentCommandFn,
    incrementCommandCountFn,
    observationBuilder,
    planRuntime,
    emitDebug: debugEmitter.emit,
  });

  try {
    while (nextExecutable) {
      const loopResult = await commandRuntime.execute(nextExecutable);
      if (loopResult === 'stop') {
        return true;
      }
      nextExecutable = planRuntime.selectNextExecutableEntry();
    }
  } finally {
    if (manageCommandThinking) {
      stopThinkingFn();
    }
  }

  await planRuntime.finalize();
  planRuntime.resetPlanReminder();

  return true;
}

export default {
  executeAgentPass,
};
