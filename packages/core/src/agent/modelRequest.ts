/**
 * Wrapper around the AI SDK responses client with ESC cancellation support.
 *
 * Responsibilities:
 * - Issue the completion request using the provided AI SDK responses client.
 * - Race the network request against ESC cancellation and surface structured outcomes.
 *
 * Consumers:
 * - Agent pass executor during the thinking phase.
 *
 * Note: The runtime still imports the compiled `modelRequest.js`; run `tsc`
 * to regenerate it after editing this source until the build pipeline emits from
 * TypeScript directly.
 */
import { register as registerCancellation } from '../utils/cancellation.js';
import {
  createResponse,
  type CreateResponseResult,
  type ResponseCallOptions,
  type ResponsesClient,
  type PlanResponseStreamPartial,
} from '../openai/responses.js';
import { getOpenAIRequestSettings } from '../openai/client.js';
import {
  createEscWaiter,
  resetEscState,
  setEscActivePromise,
  clearEscActivePromise,
  type EscState,
} from './escState.js';
import { createObservationHistoryEntry, type ObservationRecord } from './historyMessageBuilder.js';
import { buildOpenAgentRequestPayload } from './modelRequestPayload.js';
import type { ObservationBuilder } from './observationBuilder.js';
import type { ChatMessageEntry } from './historyEntry.js';
import type { RuntimeEvent } from './runtimeTypes.js';
import type { StructuredResponseEventEmitter } from './structuredResponseEventEmitter.js';

interface CancellationRegistrationOptions {
  description: string;
  onCancel?: () => void;
}

const isAbortLikeError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  const name = error.name ?? '';
  if (name === 'AbortError' || name === 'TimeoutError') {
    return true;
  }

  const message = error.message ?? '';
  return /abort|cancell?ed|timeout/i.test(message);
};

type EmitEvent = (event: RuntimeEvent) => void;

let structuredStreamDebugCounter = 0;

export interface RequestModelCompletionOptions {
  openai: ResponsesClient;
  model: string;
  history: ChatMessageEntry[];
  observationBuilder: ObservationBuilder;
  escState: EscState | null;
  startThinkingFn: () => void;
  stopThinkingFn: () => void;
  setNoHumanFlag?: (value: boolean) => void;
  emitEvent?: EmitEvent;
  passIndex: number;
  structuredResponseEmitter?: StructuredResponseEventEmitter | null;
}

export interface ModelCompletionSuccess {
  status: 'success';
  completion: CreateResponseResult;
}

export interface ModelCompletionCanceled {
  status: 'canceled';
}

export type ModelCompletionResult = ModelCompletionSuccess | ModelCompletionCanceled;

export async function requestModelCompletion({
  openai,
  model,
  history,
  observationBuilder,
  escState,
  startThinkingFn,
  stopThinkingFn,
  setNoHumanFlag,
  emitEvent = () => {},
  passIndex,
  structuredResponseEmitter = null,
}: RequestModelCompletionOptions): Promise<ModelCompletionResult> {
  if (!openai) {
    throw new Error('requestModelCompletion requires an AI SDK responses client.');
  }
  const { promise: escPromise, cleanup: cleanupEscWaiter } = createEscWaiter(escState);

  startThinkingFn();
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const { timeoutMs, maxRetries } = getOpenAIRequestSettings();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  if (controller && typeof timeoutMs === 'number' && timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      try {
        controller.abort(new Error('openagent-request-timeout'));
      } catch (_error) {
        controller.abort();
      }
    }, timeoutMs);
  }
  const cancellationRegistration: CancellationRegistrationOptions = {
    description: 'ai-sdk.generate',
  };

  if (controller) {
    cancellationRegistration.onCancel = () => controller.abort();
  }

  const cancellationOp = registerCancellation(cancellationRegistration);

  const streamDebugId = `structured-response-stream-${++structuredStreamDebugCounter}`;
  let streamPanelCleared = false;

  const emitStructuredStreamInstruction = (
    action: 'replace' | 'remove',
    value?: PlanResponseStreamPartial,
  ): void => {
    try {
      const clonedValue: PlanResponseStreamPartial | null = (() => {
        if (action === 'remove') {
          return null;
        }
        if (!value) {
          return null;
        }
        try {
          return JSON.parse(JSON.stringify(value)) as PlanResponseStreamPartial;
        } catch (_serializationError) {
          return null;
        }
      })();

      emitEvent({
        type: 'debug',
        id: streamDebugId,
        payload: {
          stage: 'structured-stream',
          action,
          value: clonedValue,
        },
      });
    } catch (_error) {
      // Ignore debug stream emission failures to keep the request resilient.
    }
  };

  const emitStructuredStreamPartial = (value: PlanResponseStreamPartial): void => {
    streamPanelCleared = false;
    structuredResponseEmitter?.handleStreamPartial(value);
    emitStructuredStreamInstruction('replace', value);
  };

  const clearStructuredStreamPanel = (): void => {
    if (streamPanelCleared) {
      return;
    }
    streamPanelCleared = true;
    emitStructuredStreamInstruction('remove');
  };

  const requestOptions: ResponseCallOptions = {};
  if (controller) {
    requestOptions.signal = controller.signal;
  }

  if (typeof maxRetries === 'number') {
    requestOptions.maxRetries = maxRetries;
  }

  const normalizedRequestOptions =
    requestOptions.signal !== undefined || requestOptions.maxRetries !== undefined
      ? requestOptions
      : undefined;
  const requestPayload = buildOpenAgentRequestPayload({
    model,
    history,
    options: normalizedRequestOptions,
  });

  const requestPromise = createResponse({
    openai,
    model: requestPayload.model,
    input: requestPayload.messages,
    tools: [requestPayload.tool],
    options: requestPayload.options,
    onStructuredStreamPartial: emitStructuredStreamPartial,
    onStructuredStreamFinish: clearStructuredStreamPanel,
  });

  setEscActivePromise(escState, {
    promise: requestPromise,
    cancel: () => {
      let canceledViaManager = false;
      if (cancellationOp && typeof cancellationOp.cancel === 'function') {
        canceledViaManager = Boolean(cancellationOp.cancel('ui-cancel'));
      }

      if (!canceledViaManager && controller) {
        try {
          controller.abort();
        } catch {
          // Ignore abort errors triggered by ESC.
        }
      }
    },
  });

  try {
    type CompletionOutcome =
      | { kind: 'completion'; value: CreateResponseResult }
      | { kind: 'escape'; payload: unknown };

    const raceCandidates: Array<Promise<CompletionOutcome>> = [
      requestPromise.then((value) => ({ kind: 'completion' as const, value })),
    ];

    if (escPromise) {
      raceCandidates.push(escPromise.then((payload) => ({ kind: 'escape' as const, payload })));
    }

    const outcome = await Promise.race(raceCandidates);

    if (outcome.kind === 'escape') {
      if (controller) {
        try {
          controller.abort();
        } catch {
          // Ignore abort errors triggered by ESC.
        }
      }
      if (cancellationOp && typeof cancellationOp.cancel === 'function') {
        cancellationOp.cancel('ui-cancel');
      }

      void requestPromise.catch((error: unknown) => {
        if (!error) return null;
        if (isAbortLikeError(error)) {
          return null;
        }
        throw error;
      });

      resetEscState(escState);
      emitEvent({
        type: 'status',
        payload: {
          level: 'warn',
          message: 'Operation canceled via user request.',
          details: null,
        },
      });

      if (typeof setNoHumanFlag === 'function') {
        setNoHumanFlag(false);
      }

      const observation: ObservationRecord = observationBuilder.buildCancellationObservation({
        reason: 'escape_key',
        message: 'Human canceled the in-flight request.',
        metadata: { esc_payload: outcome.payload ?? null },
      });

      history.push(createObservationHistoryEntry({ observation, pass: passIndex }));
      clearStructuredStreamPanel();
      return { status: 'canceled' };
    }

    resetEscState(escState);
    return { status: 'success', completion: outcome.value };
  } catch (error: unknown) {
    if (isAbortLikeError(error)) {
      resetEscState(escState);

      emitEvent({
        type: 'status',
        payload: {
          level: 'warn',
          message: 'Operation aborted before completion.',
          details: null,
        },
      });

      if (typeof setNoHumanFlag === 'function') {
        setNoHumanFlag(false);
      }

      const observation: ObservationRecord = observationBuilder.buildCancellationObservation({
        reason: 'abort',
        message: 'The in-flight request was aborted before completion.',
      });

      history.push(createObservationHistoryEntry({ observation, pass: passIndex }));
      clearStructuredStreamPanel();
      return { status: 'canceled' };
    }

    throw error;
  } finally {
    cleanupEscWaiter();
    clearEscActivePromise(escState);
    if (cancellationOp && typeof cancellationOp.unregister === 'function') {
      cancellationOp.unregister();
    }
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    stopThinkingFn();
    clearStructuredStreamPanel();
  }
}

export default {
  requestModelCompletion,
};
