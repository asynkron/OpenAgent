import chalk from 'chalk';

import { register as registerCancellation } from '../utils/cancellation.js';
import { createResponse } from '../openai/responses.js';
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
    text: {
      format: { type: 'json_object' },
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
      if (cancellationOp && typeof cancellationOp.cancel === 'function') {
        cancellationOp.cancel('esc-key');
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
      console.log(chalk.yellow('Operation canceled via ESC key.'));

      if (typeof setNoHumanFlag === 'function') {
        setNoHumanFlag(false);
      }

      const observation = observationBuilder.buildCancellationObservation({
        reason: 'escape_key',
        message: 'Human pressed ESC to cancel the in-flight request.',
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

      console.log(chalk.yellow('Operation canceled.'));

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
