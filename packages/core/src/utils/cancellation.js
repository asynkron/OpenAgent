/**
 * Global cancellation manager that coordinates aborting the in-flight async task
 * (OpenAI request or shell command) and exposes helper primitives the agent loop
 * can share across modules.
 */

const state = {
  stack: [],
  tokens: new Map(),
};

function cleanupStack() {
  for (let i = state.stack.length - 1; i >= 0; i -= 1) {
    const entry = state.stack[i];
    if (!entry || entry.removed) {
      state.stack.splice(i, 1);
      if (entry && entry.token) {
        if (!entry.canceled) {
          state.tokens.delete(entry.token);
        }
      }
    }
  }
}

function getTopEntry() {
  cleanupStack();
  if (state.stack.length === 0) {
    return null;
  }
  return state.stack[state.stack.length - 1];
}

function removeEntry(entry) {
  if (!entry) {
    return;
  }
  const index = state.stack.findIndex((candidate) => candidate === entry);
  if (index !== -1) {
    state.stack.splice(index, 1);
  }
  entry.removed = true;
  if (entry.token && !entry.canceled) {
    state.tokens.delete(entry.token);
  }
}

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

  removeEntry(entry);
  return true;
}

export function register({ description = 'operation', onCancel } = {}) {
  cleanupStack();

  const token = Symbol('cancellation-operation');
  const entry = {
    token,
    description,
    cancelFn: typeof onCancel === 'function' ? onCancel : null,
    canceled: false,
    reason: null,
    createdAt: Date.now(),
    cancelError: null,
    removed: false,
  };

  state.stack.push(entry);
  state.tokens.set(token, entry);

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
      if (!entry.removed) {
        removeEntry(entry);
      }
    },
  };
}

export function cancel(reason) {
  const active = getTopEntry();
  if (!active) {
    return false;
  }
  return markCanceled(active, reason);
}

export function isCanceled(token) {
  cleanupStack();
  if (token) {
    const entry = state.tokens.get(token);
    return entry ? entry.canceled : false;
  }
  const active = getTopEntry();
  return active ? active.canceled : false;
}

export function getActiveOperation() {
  return getTopEntry();
}

export default {
  register,
  cancel,
  isCanceled,
  getActiveOperation,
};
