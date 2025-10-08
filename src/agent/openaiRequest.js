import { register as registerCancellation } from '../utils/cancellation.js';
import { createResponse } from '../openai/responses.js';
import { OPENAGENT_RESPONSE_TOOL } from './responseToolSchema.js';
import { createEscWaiter, resetEscState } from './escState.js';

export async function requestModelCompletion({
  openai,
  model,
  history,
  observationBuilder,
  escState,
  startThinkingFn,
  stopThinkingFn,
  setNoHumanFlag,
  emitEvent = () => { },
}) {
  const { promise: escPromise, cleanup: cleanupEscWaiter } = createEscWaiter(escState);

  startThinkingFn();
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const cancellationOp = registerCancellation({
    description: 'openai.responses.create',
    onCancel: controller ? () => controller.abort() : null,
  });

  const requestOptions = controller ? { signal: controller.signal } : undefined;
  const requestPromise = createResponse({
    openai,
    model,
    input: history,
    tools: [OPENAGENT_RESPONSE_TOOL],
    options: requestOptions,
  });

  try {
    const raceCandidates = [requestPromise.then((value) => ({ kind: 'completion', value }))];

    if (escPromise) {
      raceCandidates.push(escPromise.then((payload) => ({ kind: 'escape', payload })));
    }

    const outcome = await Promise.race(raceCandidates);

    if (outcome.kind === 'escape') {
      if (cancellationOp && typeof cancellationOp.cancel === 'function') {
        cancellationOp.cancel('ui-cancel');
      }

      await requestPromise.catch((error) => {
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
    if (
      error &&
      (error.name === 'APIUserAbortError' ||
        (typeof error.message === 'string' && error.message.includes('aborted')))
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
    if (cancellationOp && typeof cancellationOp.unregister === 'function') {
      cancellationOp.unregister();
    }
    stopThinkingFn();
  }
}

export default {
  requestModelCompletion,
};
