/**
 * Creates and manages cancellation state that can be triggered by UI events.
 *
 * Instead of wiring directly to CLI readline events, the returned helpers expose
 * a `trigger` function that consumers call when a cancellation signal arrives
 * (e.g. from the UI input stream).
 */
export function createEscState({ onTrigger } = {}) {
  const state = {
    triggered: false,
    payload: null,
    waiters: new Set(),
  };

  const trigger = (payload = null) => {
    state.triggered = true;
    state.payload = payload;
    if (state.waiters.size > 0) {
      for (const resolve of Array.from(state.waiters)) {
        try {
          resolve(payload);
        } catch {
          // Ignore waiter resolution errors.
        }
      }
      state.waiters.clear();
    }
  };

  let unsubscribe = null;
  if (typeof onTrigger === 'function') {
    try {
      unsubscribe = onTrigger(trigger);
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

export function createEscWaiter(escState) {
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

  let resolver;
  const promise = new Promise((resolve) => {
    resolver = (payload) => resolve(payload ?? null);
  });

  escState.waiters.add(resolver);

  const cleanup = () => {
    if (resolver && escState.waiters && typeof escState.waiters.delete === 'function') {
      escState.waiters.delete(resolver);
    }
  };

  return { promise, cleanup };
}

export function resetEscState(escState) {
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
