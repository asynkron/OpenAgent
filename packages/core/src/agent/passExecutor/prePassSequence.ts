import type ObservationBuilder from '../observationBuilder.js';
import type { ResponsesClient } from '../../openai/responses.js';
import type { EscState } from '../escState.js';
import type { HistoryCompactor } from '../historyCompactor.js';
import type { ChatMessageEntry } from '../historyEntry.js';
import type { DebugEmitter } from './debugEmitter.js';
import type { CompletionAttempt, EmitEvent, NormalizedExecuteAgentPassOptions } from './types.js';

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
    emitEvent({
      type: 'status',
      payload: {
        level: 'warn',
        message: '[failsafe] Unable to evaluate request payload size before history compaction.',
        details: error instanceof Error ? error.message : String(error),
      },
    });
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
    emitEvent({
      type: 'status',
      payload: {
        level: 'warn',
        message: '[history-compactor] Unexpected error during history compaction.',
        details: error instanceof Error ? error.message : String(error),
      },
    });
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
        type: 'context-usage',
        payload: {
          usage,
        },
      });
    }
  } catch (error) {
    emitEvent({
      type: 'status',
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
      type: 'error',
      payload: {
        message: 'OpenAI response did not include text output.',
        details: null,
        raw: null,
        attempts: null,
      },
    });
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

  return { status: 'success', responseContent };
};

export type PrePassSequenceResult =
  | { status: 'canceled' }
  | { status: 'missing-content' }
  | { status: 'completed'; responseContent: string };

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
  });

  if (completionAttempt.status === 'canceled') {
    return { status: 'canceled' };
  }

  if (completionAttempt.status === 'missing-content') {
    return { status: 'missing-content' };
  }

  return { status: 'completed', responseContent: completionAttempt.responseContent };
};

export type { CompletionAttempt };
