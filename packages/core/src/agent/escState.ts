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

export type EscPayload = string | { reason: string };

export type EscWaiter = (payload: EscPayload | null) => void;

export type EscTrigger = (payload?: EscPayload | null) => void;

export interface EscState {
  triggered: boolean;
  payload: EscPayload | null;
  waiters: Set<EscWaiter>;
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

export interface EscWaiterResult {
  promise: Promise<EscPayload | null> | null;
  cleanup: () => void;
}

export function createEscState({ onTrigger }: CreateEscStateOptions = {}): EscStateController {
  const state: EscState = {
    triggered: false,
    payload: null,
    waiters: new Set<EscWaiter>(),
  };

  const trigger: EscTrigger = (payload = null) => {
    state.triggered = true;
    state.payload = payload ?? null;

    if (state.waiters.size > 0) {
      const waiters = Array.from(state.waiters);
      state.waiters.clear();

      for (const resolve of waiters) {
        try {
          resolve(payload ?? null);
        } catch {
          // Ignore waiter resolution errors.
        }
      }
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
        // Ignore cleanup errors during detach.
      }
    }
  };

  state.trigger = trigger;

  return { state, trigger, detach };
}

export function createEscWaiter(escState: EscState | null | undefined): EscWaiterResult {
  if (!escState) {
    return { promise: null, cleanup: () => {} };
  }

  if (escState.triggered) {
    return {
      promise: Promise.resolve(escState.payload ?? null),
      cleanup: () => {},
    };
  }

  let resolver: EscWaiter | null = null;
  const promise = new Promise<EscPayload | null>((resolve) => {
    resolver = (payload) => resolve(payload ?? null);
  });

  if (!resolver) {
    return { promise: null, cleanup: () => {} };
  }

  escState.waiters.add(resolver);

  const cleanup = () => {
    escState.waiters.delete(resolver as EscWaiter);
  };

  return { promise, cleanup };
}

export function resetEscState(escState: EscState | null | undefined): void {
  if (!escState) {
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
