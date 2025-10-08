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
    tools: [
      {
        type: 'function',
        name: 'open-agent',
        description:
          'Return the response envelope that matches the OpenAgent protocol (message, plan, and command fields).',
        parameters: {
          type: 'object',
          additionalProperties: false,
          required: ['message'],
          properties: {
            message: {
              type: 'string',
              description: 'Markdown formatted message to the user',
            },
            plan: {
              type: 'array',
              maxItems: 3,
              items: { $ref: '#/$defs/planStep' },
              description:
                'You MUST provide a plan when have a set goal, Progress tracker for multi-step work; use [] when resetting to a new plan.',
            },
            command: {
              type: 'object',
              additionalProperties: false,
              properties: {
                description: {
                  type: 'string',
                  description: 'Human-friendly summary of why the command is needed.',
                },
                shell: {
                  type: 'string',
                  description: 'Shell executable to launch when running commands.',
                },
                run: {
                  type: 'string',
                  description: 'Command string to execute in the provided shell.',
                },
                cwd: {
                  type: 'string',
                  description: 'Working directory for shell execution.',
                },
                timeout_sec: {
                  type: 'integer',
                  minimum: 1,
                  description: 'Optional timeout guard for long-running commands.',
                },
                filter_regex: {
                  type: 'string',
                  description: 'Optional regex used to filter command output.',
                },
                tail_lines: {
                  type: 'integer',
                  minimum: 1,
                  description: 'Optional number of trailing lines to return from output.',
                },
                read: { $ref: '#/$defs/readCommand' },
              },
              oneOf: [{ required: ['shell', 'run', 'cwd'] }, { required: ['read'] }],
              description:
                'Next tool invocation to execute when a plan contains non-complete steps.',
            },
          },
          $defs: {
            planStep: {
              type: 'object',
              required: ['step', 'title', 'status'],
              additionalProperties: false,
              properties: {
                step: { type: 'string' },
                title: { type: 'string' },
                status: { type: 'string', enum: ['pending', 'running', 'completed'] },
                substeps: {
                  type: 'array',
                  items: { $ref: '#/$defs/planStep' },
                },
              },
            },
            readCommand: {
              type: 'object',
              required: ['path'],
              additionalProperties: false,
              properties: {
                path: { type: 'string' },
                paths: { type: 'array', items: { type: 'string' } },
                encoding: { type: 'string' },
                max_bytes: { type: 'integer', minimum: 1 },
                max_lines: { type: 'integer', minimum: 1 },
              },
            },
          },
        },
      },
    ],
    tool_choice: {
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
