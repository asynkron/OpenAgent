import type { DebugMetadata } from './types.js';

export type DebugListener = ((payload: DebugMetadata) => void) | null | undefined;

export interface DebugEmitter {
  emit(payload: unknown): void;
}

const normalizePayload = (candidate: unknown): DebugMetadata | null => {
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  const payload = candidate as Record<string, unknown>;
  if (typeof payload.stage !== 'string') {
    return null;
  }

  return payload as DebugMetadata;
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

      const normalized = normalizePayload(resolved);
      if (!normalized) {
        return;
      }

      listener(normalized);
    },
  } satisfies DebugEmitter;
};
