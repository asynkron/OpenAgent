import type { DebugRuntimeEventPayload } from '../runtimeEvents.js';

export type DebugListener = ((payload: DebugRuntimeEventPayload) => void) | null | undefined;

export interface DebugEmitter {
  emit(payload: unknown): void;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object';

const ensureStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const ensureSchemaErrors = (value: unknown): value is ReadonlyArray<Record<string, unknown>> =>
  Array.isArray(value) && value.every((item) => isObject(item));

const isDebugRuntimeEventPayload = (candidate: unknown): candidate is DebugRuntimeEventPayload => {
  if (!isObject(candidate)) {
    return false;
  }

  const stage = candidate.stage;
  if (typeof stage !== 'string') {
    return false;
  }

  switch (stage) {
    case 'openai-response':
      return ('toolCall' in candidate ? candidate.toolCall === null || isObject(candidate.toolCall) : true);
    case 'command-execution':
      return (
        'command' in candidate &&
        ('command' in candidate ? candidate.command === null || isObject(candidate.command) : true) &&
        ('result' in candidate ? candidate.result === null || isObject(candidate.result) : true) &&
        ('execution' in candidate ? candidate.execution === null || isObject(candidate.execution) : true) &&
        ('observation' in candidate ? candidate.observation === null || isObject(candidate.observation) : true)
      );
    case 'assistant-response-schema-validation-error':
      return (
        typeof (candidate as { message?: unknown }).message === 'string' &&
        ensureSchemaErrors((candidate as { errors?: unknown }).errors) &&
        typeof (candidate as { raw?: unknown }).raw === 'string'
      );
    case 'assistant-response-validation-error':
      return (
        typeof (candidate as { message?: unknown }).message === 'string' &&
        typeof (candidate as { details?: unknown }).details === 'string' &&
        ensureStringArray((candidate as { errors?: unknown }).errors) &&
        typeof (candidate as { raw?: unknown }).raw === 'string'
      );
    case 'assistant-response':
      return 'parsed' in candidate && isObject(candidate.parsed);
    case 'memory-policy-applied':
      return typeof (candidate as { historyLength?: unknown }).historyLength === 'number';
    case 'debug-payload-error':
      return typeof (candidate as { message?: unknown }).message === 'string';
    case 'structured-stream': {
      const action = (candidate as { action?: unknown }).action;
      if (action !== 'replace' && action !== 'remove') {
        return false;
      }
      const value = (candidate as { value?: unknown }).value;
      return value === null || typeof value === 'undefined' || isObject(value);
    }
    default:
      return false;
  }
};

export const createDebugEmitter = (listener: DebugListener): DebugEmitter => {
  if (typeof listener !== 'function') {
    return {
      emit() {
        /* noop */
      },
    } satisfies DebugEmitter;
  }

  return {
    emit(payload: unknown): void {
      let resolved: unknown = payload;

      try {
        resolved = typeof payload === 'function' ? (payload as () => unknown)() : payload;
      } catch (error) {
        listener({
          stage: 'debug-payload-error',
          message: error instanceof Error ? error.message : String(error),
        });
        return;
      }

      if (!isDebugRuntimeEventPayload(resolved)) {
        return;
      }

      listener(resolved);
    },
  } satisfies DebugEmitter;
};
