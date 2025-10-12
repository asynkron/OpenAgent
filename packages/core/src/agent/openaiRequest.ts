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
  const cancellationRegistration: CancellationRegistrationOptions = {
    description: 'openai.responses.create',
  };

  if (controller) {
    cancellationRegistration.onCancel = () => controller.abort();
  }

  const cancellationOp = registerCancellation(cancellationRegistration);

  const requestOptions = controller ? { signal: controller.signal } : undefined;
  const requestPromise = createResponse({
    openai,
    model,
    input: mapHistoryToOpenAIMessages(history),
    tools: [OPENAGENT_RESPONSE_TOOL],
    tool_choice: {
      type: 'function',
      name: 'open-agent',
    },
    options: requestOptions,
  } as any);

  try {
    const raceCandidates: Array<Promise<{ kind: 'completion'; value: unknown } | { kind: 'escape'; payload: unknown }>> = [
      requestPromise.then((value: unknown) => ({ kind: 'completion' as const, value })),
    ];

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
        if (error.name === 'APIUserAbortError') return null;
        if (typeof error.message === 'string' && error.message.includes('aborted')) {
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
    if (
      error &&
      (error.name === 'APIUserAbortError' || (typeof error.message === 'string' && error.message.includes('aborted')))
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
    stopThinkingFn();
  }
}

export default {
  requestModelCompletion,
};
