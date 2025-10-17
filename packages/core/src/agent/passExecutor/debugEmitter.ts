import type { DebugPayload } from './types.js';

export type DebugListener = ((payload: DebugPayload) => void) | null | undefined;

export interface DebugEmitter {
  emit(payloadOrFactory: DebugPayload | (() => DebugPayload)): void;
}

export const createDebugEmitter = (listener: DebugListener): DebugEmitter => {
  if (typeof listener !== 'function') {
    return {
      emit() {
        /* noop */
      },
    } satisfies DebugEmitter;
  }

  return {
    emit(payloadOrFactory: DebugPayload | (() => DebugPayload)): void {
      let resolved: DebugPayload;

      try {
        resolved =
          typeof payloadOrFactory === 'function'
            ? (payloadOrFactory as () => DebugPayload)()
            : payloadOrFactory;
      } catch (error) {
        listener({
          stage: 'debug-payload-error',
          message: error instanceof Error ? error.message : String(error),
        });
        return;
      }

      listener(resolved);
    },
  } satisfies DebugEmitter;
};
