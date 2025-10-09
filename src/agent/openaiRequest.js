import { register as registerCancellation } from '../utils/cancellation.js';
import { createResponse } from '../openai/responses.js';
import { OPENAGENT_RESPONSE_TOOL } from './responseToolSchema.js';
import { createEscWaiter, resetEscState } from './escState.js';

const noop = () => {};

function isAbortLike(error) {
  if (!error) {
    return false;
  }

  if (error.name === 'APIUserAbortError') {
    return true;
  }

  const message = typeof error.message === 'string' ? error.message : '';
  return message.includes('aborted');
}

async function swallowAbortErrors(promise) {
  try {
    await promise;
  } catch (error) {
    if (!isAbortLike(error)) {
      throw error;
    }
  }
}

export async function requestModelCompletion({
  openai,
  model,
  history,
  observationBuilder,
  escState,
  startThinkingFn,
  stopThinkingFn,
  setNoHumanFlag,
  emitEvent = noop,
}) {
  const { promise: escPromise, cleanup: cleanupEscWaiter } = createEscWaiter(escState);

  startThinkingFn();
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const cancellationOp = registerCancellation({
    description: 'openai.responses.create',
    onCancel: controller ? () => controller.abort() : null,
  });

  const safeSetNoHumanFlag = typeof setNoHumanFlag === 'function' ? setNoHumanFlag : noop;
  const safeCancel = cancellationOp?.cancel ?? noop;
  const safeUnregister = cancellationOp?.unregister ?? noop;

  const requestOptions = controller ? { signal: controller.signal } : undefined;
  const requestPromise = createResponse({
    openai,
    model,
    input: history,
    text: { format: { type: 'json_object' } },
    tools: [OPENAGENT_RESPONSE_TOOL],
    toolChoice: {
      type: 'function',
      name: 'open-agent',
    },
    options: requestOptions,
  });

  try {
    const raceCandidates = [requestPromise.then((value) => ({ kind: 'completion', value }))];

    if (escPromise) {
      raceCandidates.push(escPromise.then((payload) => ({ kind: 'escape', payload })));
    }

    const outcome = await Promise.race(raceCandidates);

    if (outcome.kind === 'escape') {
      safeCancel('ui-cancel');
      await swallowAbortErrors(requestPromise);

      resetEscState(escState);
      emitEvent({
        type: 'status',
        level: 'warn',
        message: 'Cancellation requested by UI.',
      });

      safeSetNoHumanFlag(false);

      const observation = observationBuilder.buildCancellationObservation({
        reason: 'escape_key',
        message: 'Human canceled the in-flight request.',
        metadata: { esc_payload: outcome.payload ?? null },
      });

      history.push({ role: 'user', content: JSON.stringify(observation) });
      return { status: 'canceled' };
    }

    resetEscState(escState);
    return { status: 'success', completion: outcome.value };
  } catch (error) {
    if (isAbortLike(error)) {
      resetEscState(escState);

      emitEvent({
        type: 'status',
        level: 'warn',
        message: 'Operation aborted before completion.',
      });

      safeSetNoHumanFlag(false);

      const observation = observationBuilder.buildCancellationObservation({
        reason: 'abort',
        message: 'The in-flight request was aborted before completion.',
      });

      history.push({ role: 'user', content: JSON.stringify(observation) });
      return { status: 'canceled' };
    }

    throw error;
  } finally {
    cleanupEscWaiter();
    safeUnregister();
    stopThinkingFn();
  }
}

export default {
  requestModelCompletion,
};
