/**
 * Global cancellation manager that coordinates aborting the in-flight async task
 * (OpenAI request or shell command) and exposes helper primitives the agent loop
 * can share across modules.
 */

const noop = () => {};

const state = {
  stack: [],
  entries: new WeakMap(),
  pending: null,
};

function entryFor(token) {
  return token ? state.entries.get(token) ?? null : null;
}

function snapshotEntry(token, entry) {
  if (!entry) {
    return null;
  }

  return {
    token,
    description: entry.description,
    canceled: entry.canceled,
    reason: entry.reason,
    createdAt: entry.createdAt,
    cancelError: entry.cancelError,
  };
}

function pruneStack() {
  while (state.stack.length > 0) {
    const token = state.stack[state.stack.length - 1];
    const entry = entryFor(token);
    if (!entry || entry.cleared) {
      state.stack.pop();
      continue;
    }
    break;
  }
}

function removeToken(token) {
  const entry = entryFor(token);
  if (!entry || entry.cleared) {
    return;
  }

  entry.cleared = true;
  const index = state.stack.indexOf(token);
  if (index !== -1) {
    state.stack.splice(index, 1);
  }
  pruneStack();
}

function markCanceled(token, reason) {
  const entry = entryFor(token);
  if (!entry || entry.canceled) {
    return false;
  }

  entry.canceled = true;
  entry.reason = reason ?? null;

  try {
    entry.cancelFn(reason);
  } catch (error) {
    entry.cancelError = error;
  }

  removeToken(token);
  return true;
}

export function register({ description = 'operation', onCancel } = {}) {
  pruneStack();

  const token = {};
  const entry = {
    description: typeof description === 'string' ? description.trim() || 'operation' : 'operation',
    cancelFn: typeof onCancel === 'function' ? onCancel : noop,
    canceled: false,
    reason: null,
    createdAt: Date.now(),
    cancelError: null,
    cleared: false,
  };

  state.stack.push(token);
  state.entries.set(token, entry);

  if (state.pending !== null) {
    const pendingReason = state.pending;
    state.pending = null;
    markCanceled(token, pendingReason);
  }

  return {
    token,
    isCanceled: () => entry.canceled,
    cancel: (reason) => markCanceled(token, reason),
    setCancelCallback: (fn) => {
      entry.cancelFn = typeof fn === 'function' ? fn : noop;
    },
    updateDescription: (desc) => {
      const next = typeof desc === 'string' ? desc.trim() : '';
      if (next) {
        entry.description = next;
      }
    },
    unregister: () => removeToken(token),
  };
}

export function cancel(reason) {
  pruneStack();
  const token = state.stack[state.stack.length - 1];
  if (!token) {
    state.pending = reason ?? null;
    return false;
  }
  return markCanceled(token, reason);
}

export function isCanceled(token) {
  pruneStack();
  if (token) {
    const entry = entryFor(token);
    return entry ? entry.canceled : false;
  }

  const activeToken = state.stack[state.stack.length - 1];
  const activeEntry = entryFor(activeToken);
  return activeEntry ? activeEntry.canceled : false;
}

export function getActiveOperation() {
  pruneStack();
  const token = state.stack[state.stack.length - 1];
  return snapshotEntry(token, entryFor(token));
}

export default {
  register,
  cancel,
  isCanceled,
  getActiveOperation,
};
