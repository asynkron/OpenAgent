import { RuntimeEventType } from '../../contracts/events.js';
import type ObservationBuilder from '../observationBuilder.js';
import type { ResponsesClient } from '../../openai/responses.js';
import type { EscState } from '../escState.js';
import type { HistoryCompactor } from '../historyCompactor.js';
import type { ChatMessageEntry } from '../historyEntry.js';
import type { DebugEmitter } from './debugEmitter.js';
import type { CompletionAttempt, EmitEvent, NormalizedExecuteAgentPassOptions } from './types.js';
import { createStructuredResponseEventEmitter } from '../structuredResponseEventEmitter.js';
import type { StructuredResponseEventEmitter } from '../structuredResponseEventEmitter.js';

type SummarizeContextUsageFn =
  (typeof import('../../utils/contextUsage.js'))['summarizeContextUsage'];
type RequestModelCompletionFn = (typeof import('../modelRequest.js'))['requestModelCompletion'];
type ExtractOpenAgentToolCallFn =
  (typeof import('../../openai/responseUtils.js'))['extractOpenAgentToolCall'];
type CreateChatMessageEntryFn = (typeof import('../historyEntry.js'))['createChatMessageEntry'];

type SetNoHumanFlagFn = ((value: boolean) => void) | undefined;

interface GuardPayloadOptions {
  guardRequestPayloadSizeFn: NormalizedExecuteAgentPassOptions['guardRequestPayloadSizeFn'];
  history: ChatMessageEntry[];
  model: string;
  passIndex: number;
  emitEvent: EmitEvent;
}

const guardRequestPayloadSize = async ({
  guardRequestPayloadSizeFn,
  history,
  model,
  passIndex,
  emitEvent,
}: GuardPayloadOptions): Promise<void> => {
  if (!guardRequestPayloadSizeFn) {
    return;
  }

  try {
    await guardRequestPayloadSizeFn({ history, model, passIndex });
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    emitEvent({
      type: RuntimeEventType.Status,
      payload: {
        level: 'warn',
        message: '[failsafe] Unable to evaluate request payload size before history compaction.',
        details,
      },
      level: 'warn',
      message: '[failsafe] Unable to evaluate request payload size before history compaction.',
      details,
    } as unknown as Parameters<typeof emitEvent>[0]);
  }
};

const compactHistoryIfNeeded = async ({
  historyCompactor,
  history,
  emitEvent,
}: {
  historyCompactor: HistoryCompactor | null | undefined;
  history: ChatMessageEntry[];
  emitEvent: EmitEvent;
}): Promise<void> => {
  if (!historyCompactor) {
    return;
  }

  try {
    await historyCompactor.compactIfNeeded({ history });
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    emitEvent({
      type: RuntimeEventType.Status,
      payload: {
        level: 'warn',
        message: '[history-compactor] Unexpected error during history compaction.',
        details,
      },
      level: 'warn',
      message: '[history-compactor] Unexpected error during history compaction.',
      details,
    } as unknown as Parameters<typeof emitEvent>[0]);
  }
};

const emitContextUsageSummary = ({
  summarizeContextUsageFn,
  history,
  model,
  emitEvent,
}: {
  summarizeContextUsageFn: SummarizeContextUsageFn;
  history: ChatMessageEntry[];
  model: string;
  emitEvent: EmitEvent;
}): void => {
  try {
    const usage = summarizeContextUsageFn({ history, model });
    if (usage && usage.total) {
      emitEvent({
        type: RuntimeEventType.ContextUsage,
        payload: {
          usage,
        },
        usage,
      } as unknown as Parameters<typeof emitEvent>[0]);
    }
  } catch (error) {
    emitEvent({
      type: RuntimeEventType.Status,
      payload: {
        level: 'warn',
        message: 'Failed to summarize context usage.',
        details: error instanceof Error ? error.message : String(error),
      },
    });
  }
};

const requestAssistantCompletion = async ({
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
  passIndex,
  responseEmitter,
  isDebugEnabled,
}: {
  requestModelCompletionFn: RequestModelCompletionFn;
  extractOpenAgentToolCallFn: ExtractOpenAgentToolCallFn;
  createChatMessageEntryFn: CreateChatMessageEntryFn;
  emitDebug: DebugEmitter['emit'];
  emitEvent: EmitEvent;
  observationBuilder: ObservationBuilder;
  openai: ResponsesClient;
  model: string;
  history: ChatMessageEntry[];
  escState: EscState | null;
  startThinkingFn: () => void;
  stopThinkingFn: () => void;
  setNoHumanFlag: SetNoHumanFlagFn;
  passIndex: number;
  responseEmitter: StructuredResponseEventEmitter | null;
  isDebugEnabled: () => boolean;
}): Promise<CompletionAttempt> => {
  const completionResult = await requestModelCompletionFn({
    openai,
    model,
    history,
    observationBuilder,
    escState,
    startThinkingFn,
    stopThinkingFn,
    setNoHumanFlag,
    emitEvent,
    passIndex,
    structuredResponseEmitter: responseEmitter,
    isDebugEnabled,
  });

  if (completionResult.status === 'canceled') {
    return { status: 'canceled' };
  }

  const { completion } = completionResult;
  const toolCall = extractOpenAgentToolCallFn(completion);
  const responseContent =
    toolCall && typeof toolCall.arguments === 'string' ? toolCall.arguments : '';

  emitDebug(() => ({
    stage: 'openai-response',
    toolCall,
  }));

  if (!responseContent) {
    emitEvent({
      type: RuntimeEventType.Error,
      payload: {
        message: 'OpenAI response did not include text output.',
        details: null,
        raw: null,
        attempts: null,
      },
      message: 'OpenAI response did not include text output.',
      details: null,
      raw: null,
      attempts: null,
    } as unknown as Parameters<typeof emitEvent>[0]);
    return { status: 'missing-content' };
  }

  history.push(
    createChatMessageEntryFn({
      eventType: 'chat-message',
      role: 'assistant',
      pass: passIndex,
      content: responseContent,
    }),
  );

  return { status: 'success', responseContent, responseEmitter };
};

export type PrePassSequenceResult =
  | { status: 'canceled' }
  | { status: 'missing-content' }
  | { status: 'completed'; responseContent: string; responseEmitter: StructuredResponseEventEmitter | null };

export const runPrePassSequence = async ({
  options,
  observationBuilder,
  debugEmitter,
}: {
  options: NormalizedExecuteAgentPassOptions;
  observationBuilder: ObservationBuilder;
  debugEmitter: DebugEmitter;
}): Promise<PrePassSequenceResult> => {
  await guardRequestPayloadSize({
    guardRequestPayloadSizeFn: options.guardRequestPayloadSizeFn,
    history: options.history,
    model: options.model,
    passIndex: options.passIndex,
    emitEvent: options.emitEvent,
  });

  await compactHistoryIfNeeded({
    historyCompactor: options.historyCompactor,
    history: options.history,
    emitEvent: options.emitEvent,
  });

  emitContextUsageSummary({
    summarizeContextUsageFn: options.summarizeContextUsageFn,
    history: options.history,
    model: options.model,
    emitEvent: options.emitEvent,
  });

  const responseEmitter = createStructuredResponseEventEmitter({ emitEvent: options.emitEvent });

  const completionAttempt = await requestAssistantCompletion({
    requestModelCompletionFn: options.requestModelCompletionFn,
    extractOpenAgentToolCallFn: options.extractOpenAgentToolCallFn,
    createChatMessageEntryFn: options.createChatMessageEntryFn,
    emitDebug: debugEmitter.emit,
    emitEvent: options.emitEvent,
    observationBuilder,
    openai: options.openai,
    model: options.model,
    history: options.history,
    escState: options.escState,
    startThinkingFn: options.startThinkingFn,
    stopThinkingFn: options.stopThinkingFn,
    setNoHumanFlag: options.setNoHumanFlag,
    passIndex: options.passIndex,
    responseEmitter,
    isDebugEnabled: () => Boolean(options.getDebugFlag?.()),
  });

  if (completionAttempt.status === 'canceled') {
    return { status: 'canceled' };
  }

  if (completionAttempt.status === 'missing-content') {
    return { status: 'missing-content' };
  }

  return {
    status: 'completed',
    responseContent: completionAttempt.responseContent,
    responseEmitter: completionAttempt.responseEmitter,
  };
};

export type { CompletionAttempt };
