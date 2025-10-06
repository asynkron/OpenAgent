import { ESCAPE_EVENT } from '../cli/io.js';

/**
 * Creates and wires ESC cancellation state for the agent loop.
 * Returns the state object alongside a cleanup helper to detach listeners.
 */
export function createEscState(rl) {
  const state = {
    triggered: false,
    payload: null,
    waiters: new Set(),
  };

  if (!rl || typeof rl.on !== 'function') {
    return { state, detach: () => {} };
  }

  const handleEscape = (payload) => {
    state.triggered = true;
    state.payload = payload ?? null;
    if (state.waiters.size > 0) {
      for (const resolve of Array.from(state.waiters)) {
        try {
          resolve(payload ?? null);
        } catch (error) {
          void error;
        }
      }
      state.waiters.clear();
    }
  };

  rl.on(ESCAPE_EVENT, handleEscape);

  const detach = () => {
    if (typeof rl.off === 'function') {
      rl.off(ESCAPE_EVENT, handleEscape);
    } else if (typeof rl.removeListener === 'function') {
      rl.removeListener(ESCAPE_EVENT, handleEscape);
    }
  };

  return { state, detach };
}

export default {
  createEscState,
};
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
