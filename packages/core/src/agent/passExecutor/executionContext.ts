import { incrementCommandCount as defaultIncrementCommandCount } from '../../services/commandStatsService.js';
import {
  combineStdStreams as defaultCombineStdStreams,
  buildPreview as defaultBuildPreview,
} from '../../utils/output.js';
import ObservationBuilder from '../observationBuilder.js';
import { parseAssistantResponse as defaultParseAssistantResponse } from '../responseParser.js';
import { requestModelCompletion as defaultRequestModelCompletion } from '../modelRequest.js';
import { executeAgentCommand as defaultExecuteAgentCommand } from '../commandExecution.js';
import { summarizeContextUsage as defaultSummarizeContextUsage } from '../../utils/contextUsage.js';
import { extractOpenAgentToolCall as defaultExtractOpenAgentToolCall } from '../../openai/responseUtils.js';
import {
  validateAssistantResponseSchema as defaultValidateAssistantResponseSchema,
  validateAssistantResponse as defaultValidateAssistantResponse,
} from '../responseValidator.js';
import { createChatMessageEntry as defaultCreateChatMessageEntry } from '../historyEntry.js';
import { createPlanManagerAdapter } from './planManagerAdapter.js';
import { createDebugEmitter } from './debugEmitter.js';
import type { DebugEmitter } from './debugEmitter.js';
import type { PlanManagerAdapter } from './planManagerAdapter.js';
import type { ExecuteAgentPassOptions, NormalizedExecuteAgentPassOptions } from './types.js';

interface ExecutionContext {
  options: NormalizedExecuteAgentPassOptions;
  observationBuilder: ObservationBuilder;
  debugEmitter: DebugEmitter;
  planManagerAdapter: PlanManagerAdapter | null;
  recordLatestBaseline: () => Promise<void>;
  finalizePass: (result: boolean) => Promise<boolean>;
}

const noop = (): void => {
  /* noop */
};

const createNormalizedOptions = (
  options: ExecuteAgentPassOptions,
): NormalizedExecuteAgentPassOptions => ({
  ...options,
  emitEvent: options.emitEvent ?? noop,
  requestModelCompletionFn: options.requestModelCompletionFn ?? defaultRequestModelCompletion,
  executeAgentCommandFn: options.executeAgentCommandFn ?? defaultExecuteAgentCommand,
  parseAssistantResponseFn: options.parseAssistantResponseFn ?? defaultParseAssistantResponse,
  validateAssistantResponseSchemaFn:
    options.validateAssistantResponseSchemaFn ?? defaultValidateAssistantResponseSchema,
  validateAssistantResponseFn:
    options.validateAssistantResponseFn ?? defaultValidateAssistantResponse,
  createChatMessageEntryFn: options.createChatMessageEntryFn ?? defaultCreateChatMessageEntry,
  extractOpenAgentToolCallFn: options.extractOpenAgentToolCallFn ?? defaultExtractOpenAgentToolCall,
  summarizeContextUsageFn: options.summarizeContextUsageFn ?? defaultSummarizeContextUsage,
  incrementCommandCountFn: options.incrementCommandCountFn ?? defaultIncrementCommandCount,
  createObservationBuilderFn:
    options.createObservationBuilderFn ?? ((deps) => new ObservationBuilder(deps)),
  combineStdStreamsFn:
    options.combineStdStreamsFn ??
    ((stdout, stderr, exitCode) => defaultCombineStdStreams(stdout, stderr, exitCode ?? 0)),
  buildPreviewFn: options.buildPreviewFn ?? ((text) => defaultBuildPreview(text)),
});

export const createExecutionContext = (options: ExecuteAgentPassOptions): ExecutionContext => {
  if (typeof options.passIndex !== 'number') {
    throw new Error('executeAgentPass requires a numeric passIndex.');
  }

  const normalized = createNormalizedOptions(options);
  const debugEmitter = createDebugEmitter(normalized.onDebug);

  const observationBuilder = normalized.createObservationBuilderFn({
    combineStdStreams: normalized.combineStdStreamsFn,
    applyFilter: normalized.applyFilterFn,
    tailLines: normalized.tailLinesFn,
    buildPreview: normalized.buildPreviewFn,
  });

  const planManagerAdapter = createPlanManagerAdapter(normalized.planManager);

  const recordLatestBaseline = async (): Promise<void> => {
    if (!normalized.recordRequestPayloadSizeFn) {
      return;
    }

    try {
      await normalized.recordRequestPayloadSizeFn({
        history: normalized.history,
        model: normalized.model,
        passIndex: normalized.passIndex,
      });
    } catch (error) {
      normalized.emitEvent({
        type: 'status',
        payload: {
          level: 'warn',
          message: '[failsafe] Unable to record request payload baseline after pass.',
          details: error instanceof Error ? error.message : String(error),
        },
      });
    }
  };

  const finalizePass = async (result: boolean): Promise<boolean> => {
    await recordLatestBaseline();
    return result;
  };

  return {
    options: normalized,
    observationBuilder,
    debugEmitter,
    planManagerAdapter,
    recordLatestBaseline,
    finalizePass,
  } satisfies ExecutionContext;
};

export type { ExecutionContext };
