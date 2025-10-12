/**
 * Cancellation helpers triggered by UI ESC events.
 *
 * Responsibilities:
 * - Track whether ESC has been pressed during the current pass.
 * - Allow consumers to await the next ESC press and detach listeners when done.
 *
 * Note: The runtime still imports the compiled `escState.js`; run `tsc`
 * to regenerate it after editing this source until the build pipeline emits from
 * TypeScript directly.
 */
export type EscPayload = unknown;

export type EscTrigger = (payload?: EscPayload | null) => void;

export interface EscState {
  triggered: boolean;
  payload: EscPayload | null;
  waiters: Set<(payload: EscPayload | null) => void>;
  trigger?: EscTrigger;
}

export interface CreateEscStateOptions {
  onTrigger?: (trigger: EscTrigger) => (() => void) | void;
}

export interface EscStateController {
  state: EscState;
  trigger: EscTrigger;
  detach: () => void;
}

export function createEscState({ onTrigger }: CreateEscStateOptions = {}): EscStateController {
  const state: EscState = {
    triggered: false,
    payload: null,
    waiters: new Set(),
  };

  const trigger: EscTrigger = (payload = null) => {
    state.triggered = true;
    state.payload = payload ?? null;
    if (state.waiters.size > 0) {
      for (const resolve of Array.from(state.waiters)) {
        try {
          resolve(payload ?? null);
        } catch {
          // Ignore waiter resolution errors.
        }
      }
      state.waiters.clear();
    }
  };

  let unsubscribe: (() => void) | null = null;
  if (typeof onTrigger === 'function') {
    try {
      const maybeCleanup = onTrigger(trigger);
      unsubscribe = typeof maybeCleanup === 'function' ? maybeCleanup : null;
    } catch {
      unsubscribe = null;
    }
  }

  const detach = () => {
    if (typeof unsubscribe === 'function') {
      try {
        unsubscribe();
      } catch {
        // Ignore cleanup errors.
      }
    }
  };

  return { state, trigger, detach };
}

export interface EscWaiterResult {
  promise: Promise<EscPayload | null> | null;
  cleanup: () => void;
}

export function createEscWaiter(escState: EscState | null | undefined): EscWaiterResult {
  if (!escState || typeof escState !== 'object') {
    return { promise: null, cleanup: () => {} };
  }

  if (escState.triggered) {
    return {
      promise: Promise.resolve(escState.payload ?? null),
      cleanup: () => {},
    };
  }

  if (!escState.waiters || typeof escState.waiters.add !== 'function') {
    return { promise: null, cleanup: () => {} };
  }

  let resolver!: (payload: EscPayload | null) => void;
  const promise = new Promise<EscPayload | null>((resolve) => {
    resolver = (payload) => resolve(payload ?? null);
  });

  escState.waiters.add(resolver);

  const cleanup = () => {
    if (escState.waiters && typeof escState.waiters.delete === 'function') {
      escState.waiters.delete(resolver);
    }
  };

  return { promise, cleanup };
}

export function resetEscState(escState: EscState | null | undefined): void {
  if (!escState || typeof escState !== 'object') {
    return;
  }

  escState.triggered = false;
  escState.payload = null;
}

export default {
  createEscState,
  createEscWaiter,
  resetEscState,
};
