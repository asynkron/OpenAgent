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

export type EscPayload = string | { reason: string } | null;

export type EscWaiter = (payload: EscPayload | null) => void;

export type EscTrigger = (payload?: EscPayload) => void;

export interface EscActivePromise {
  promise: Promise<unknown>;
  cancel: (() => void) | null;
}

const activePromises = new WeakMap<EscState, EscActivePromise>();

function cancelActivePromise(state: EscState): void {
  const tracked = activePromises.get(state);
  if (!tracked) {
    return;
  }

  activePromises.delete(state);

  if (typeof tracked.cancel === 'function') {
    try {
      tracked.cancel();
    } catch {
      // Ignore cancellation failures triggered by ESC.
    }
  }
}

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

    cancelActivePromise(state);

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

  if (!escState.waiters) {
    escState.waiters = new Set<EscWaiter>();
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
  clearEscActivePromise(escState);
}

export function setEscActivePromise(
  escState: EscState | null | undefined,
  active: EscActivePromise | null,
): void {
  if (!escState) {
    return;
  }

  if (!active || !active.promise) {
    activePromises.delete(escState);
    return;
  }

  activePromises.set(escState, {
    promise: active.promise,
    cancel: active.cancel ?? null,
  });
}

export function getEscActivePromise(
  escState: EscState | null | undefined,
): EscActivePromise | null {
  if (!escState) {
    return null;
  }

  const tracked = activePromises.get(escState);
  return tracked ? { ...tracked } : null;
}

export function clearEscActivePromise(escState: EscState | null | undefined): void {
  if (!escState) {
    return;
  }

  activePromises.delete(escState);
}

export default {
  createEscState,
  createEscWaiter,
  resetEscState,
  setEscActivePromise,
  getEscActivePromise,
  clearEscActivePromise,
};
