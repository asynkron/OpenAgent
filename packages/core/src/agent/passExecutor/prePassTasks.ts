import type ObservationBuilder from '../observationBuilder.js';
import type { ResponsesClient } from '../../openai/responses.js';
import type { EscState } from '../escState.js';
import type { HistoryCompactor } from '../historyCompactor.js';
import type { ChatMessageEntry } from '../historyEntry.js';

export type EmitEvent = (event: Record<string, unknown>) => void;

export interface GuardRequestPayloadSizeInput {
  history: ChatMessageEntry[];
  model: string;
  passIndex: number;
}

export type GuardRequestPayloadSizeFn =
  | ((options: GuardRequestPayloadSizeInput) => Promise<void>)
  | null
  | undefined;

export type RecordRequestPayloadSizeFn =
  | ((options: GuardRequestPayloadSizeInput) => Promise<void>)
  | null
  | undefined;

type SummarizeContextUsageFn =
  (typeof import('../../utils/contextUsage.js'))['summarizeContextUsage'];
type RequestModelCompletionFn = (typeof import('../modelRequest.js'))['requestModelCompletion'];
type ExtractOpenAgentToolCallFn =
  (typeof import('../../openai/responseUtils.js'))['extractOpenAgentToolCall'];
type CreateChatMessageEntryFn = (typeof import('../historyEntry.js'))['createChatMessageEntry'];

type SetNoHumanFlagFn = ((value: boolean) => void) | undefined;

// Centralize the pre-request guard so the main orchestration function reads top-to-bottom
// without inlined try/catch noise.
export const guardRequestPayloadSize = async ({
  guardRequestPayloadSizeFn,
  history,
  model,
  passIndex,
  emitEvent,
}: {
  guardRequestPayloadSizeFn: GuardRequestPayloadSizeFn;
  history: ChatMessageEntry[];
  model: string;
  passIndex: number;
  emitEvent: EmitEvent;
}): Promise<void> => {
  if (!guardRequestPayloadSizeFn) {
    return;
  }

  try {
    await guardRequestPayloadSizeFn({ history, model, passIndex });
  } catch (error) {
    emitEvent({
      type: 'status',
      level: 'warn',
      message: '[failsafe] Unable to evaluate request payload size before history compaction.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};

// History compaction is optional, so tuck the defensive branch behind a helper to keep
// the happy path readable.
export const compactHistoryIfNeeded = async ({
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
      level: 'warn',
      message: '[history-compactor] Unexpected error during history compaction.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};

// The summary emission is best-effort: failures should not abort the pass execution.
export const emitContextUsageSummary = ({
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
};

export type CompletionAttempt =
  | { status: 'canceled' }
  | { status: 'missing-content' }
  | { status: 'success'; responseContent: string };

// Request a completion and normalize the outcomes so the main flow can focus on protocol logic.
export const requestAssistantCompletion = async ({
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
  emitDebug: (payloadOrFactory: unknown) => void;
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
      message: 'OpenAI response did not include text output.',
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
