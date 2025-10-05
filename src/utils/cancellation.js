/**
 * Global cancellation manager that coordinates aborting the in-flight async task
 * (OpenAI request or shell command) and exposes helper primitives the agent loop
 * can share across modules.
 */

const state = {
  current: null,
};

function markCanceled(entry, reason) {
  if (!entry || entry.canceled) {
    return false;
  }

  entry.canceled = true;
  entry.reason = reason ?? null;

  if (typeof entry.cancelFn === 'function') {
    try {
      entry.cancelFn(reason);
    } catch (error) {
      entry.cancelError = error;
    }
  }

  return true;
}

export function register({ description = 'operation', onCancel } = {}) {
  const token = Symbol('cancellation-operation');
  const entry = {
    token,
    description,
    cancelFn: typeof onCancel === 'function' ? onCancel : null,
    canceled: false,
    reason: null,
    createdAt: Date.now(),
  };

  state.current = entry;

  return {
    token,
    isCanceled: () => entry.canceled,
    cancel: (reason) => markCanceled(entry, reason),
    setCancelCallback: (fn) => {
      entry.cancelFn = typeof fn === 'function' ? fn : null;
    },
    updateDescription: (desc) => {
      if (typeof desc === 'string') {
        const normalized = desc.trim();
        if (normalized) {
          entry.description = normalized;
        }
      }
    },
    unregister: () => {
      if (state.current && state.current.token === token) {
        state.current = null;
      }
    },
  };
}

export function cancel(reason) {
  if (!state.current) {
    return false;
  }
  return markCanceled(state.current, reason);
}

export function isCanceled(token) {
  if (token && state.current && state.current.token === token) {
    return state.current.canceled;
  }
  return Boolean(state.current && state.current.canceled);
}

export function getActiveOperation() {
  return state.current;
}

export default {
  register,
  cancel,
  isCanceled,
  getActiveOperation,
};
