// @ts-nocheck
/**
 * Wrapper around the OpenAI Responses API with ESC cancellation support.
 *
 * Responsibilities:
 * - Issue the completion request using the provided OpenAI client.
 * - Race the network request against ESC cancellation and surface structured outcomes.
 *
 * Consumers:
 * - Agent pass executor during the thinking phase.
 *
 * Note: The runtime still imports the compiled `openaiRequest.js`; run `tsc`
 * to regenerate it after editing this source until the build pipeline emits from
 * TypeScript directly.
 */
import { register as registerCancellation } from '../utils/cancellation.js';
import { createResponse } from '../openai/responses.js';
import { OPENAGENT_RESPONSE_TOOL } from './responseToolSchema.js';
import { getOpenAIRequestSettings } from '../openai/client.js';
import { createEscWaiter, resetEscState, type EscState } from './escState.js';
import { createObservationHistoryEntry, type ObservationRecord } from './historyMessageBuilder.js';
import { mapHistoryToOpenAIMessages } from './historyEntry.js';
import type { ObservationBuilder } from './observationBuilder.js';
import type { ChatMessageEntry } from './historyEntry.js';

interface CancellationRegistrationOptions {
  description: string;
  onCancel?: () => void;
}

export interface RequestModelCompletionOptions {
  openai: unknown;
  model: string;
  history: ChatMessageEntry[];
  observationBuilder: ObservationBuilder;
  escState: EscState | null;
  startThinkingFn: () => void;
  stopThinkingFn: () => void;
  setNoHumanFlag?: (value: boolean) => void;
  emitEvent?: (event: Record<string, unknown>) => void;
  passIndex: number;
}

export interface ModelCompletionSuccess {
  status: 'success';
  completion: unknown;
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
}: RequestModelCompletionOptions): Promise<ModelCompletionResult> {
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

  const requestOptions: Record<string, unknown> = {};
  if (controller) {
    requestOptions.signal = controller.signal;
  }

  if (typeof maxRetries === 'number') {
    requestOptions.maxRetries = maxRetries;
  }

  const normalizedRequestOptions = Object.keys(requestOptions).length > 0 ? requestOptions : undefined;
  const requestPromise = createResponse({
    openai,
    model,
    input: mapHistoryToOpenAIMessages(history),
    tools: [OPENAGENT_RESPONSE_TOOL],
    options: normalizedRequestOptions,
  } as any);

  try {
    const raceCandidates: Array<
      Promise<{ kind: 'completion'; value: unknown } | { kind: 'escape'; payload: unknown }>
    > = [requestPromise.then((value: unknown) => ({ kind: 'completion' as const, value }))];

    if (escPromise) {
      raceCandidates.push(escPromise.then((payload) => ({ kind: 'escape' as const, payload })));
    }

    const outcome = await Promise.race(raceCandidates);

    if (outcome.kind === 'escape') {
      if (cancellationOp && typeof cancellationOp.cancel === 'function') {
        cancellationOp.cancel('ui-cancel');
      }

      await requestPromise.catch((error: any) => {
        if (!error) return null;
        const name = typeof error.name === 'string' ? error.name : '';
        const message = typeof error.message === 'string' ? error.message : '';
        if (name === 'AbortError') return null;
        if (name === 'TimeoutError') return null;
        if (/abort|cancell?ed|timeout/i.test(message)) {
          return null;
        }
        throw error;
      });

      resetEscState(escState);
      emitEvent({
        type: 'status',
        level: 'warn',
        message: 'Operation canceled via user request.',
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
      return { status: 'canceled' };
    }

    resetEscState(escState);
    return { status: 'success', completion: outcome.value };
  } catch (error: any) {
    const name = error && typeof error.name === 'string' ? error.name : '';
    const message = error && typeof error.message === 'string' ? error.message : '';
    if (
      error &&
      (name === 'AbortError' ||
        name === 'TimeoutError' ||
        /abort|cancell?ed|timeout/i.test(message))
    ) {
      resetEscState(escState);

      emitEvent({
        type: 'status',
        level: 'warn',
        message: 'Operation aborted before completion.',
      });

      if (typeof setNoHumanFlag === 'function') {
        setNoHumanFlag(false);
      }

      const observation: ObservationRecord = observationBuilder.buildCancellationObservation({
        reason: 'abort',
        message: 'The in-flight request was aborted before completion.',
      });

      history.push(createObservationHistoryEntry({ observation, pass: passIndex }));
      return { status: 'canceled' };
    }

    throw error;
  } finally {
    cleanupEscWaiter();
    if (cancellationOp && typeof cancellationOp.unregister === 'function') {
      cancellationOp.unregister();
    }
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    stopThinkingFn();
  }
}

export default {
  requestModelCompletion,
};
