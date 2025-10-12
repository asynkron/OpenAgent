/**
 * Global cancellation manager coordinating abortable operations that span the
 * OpenAgent runtime (OpenAI requests, shell commands, etc.).
 */

type CancelCallback = (reason?: unknown) => void;

type CancellationReason = unknown | null;

type CancellationEntry = {
  token: symbol;
  description: string;
  cancelFn: CancelCallback | null;
  canceled: boolean;
  reason: CancellationReason;
  createdAt: number;
  cancelError: unknown;
  removed: boolean;
};

type CancellationState = {
  stack: CancellationEntry[];
  tokens: Map<symbol, CancellationEntry>;
};

const state: CancellationState = {
  stack: [],
  tokens: new Map(),
};

function cleanupStack(): void {
  for (let i = state.stack.length - 1; i >= 0; i -= 1) {
    const entry = state.stack[i];
    if (!entry || entry.removed) {
      state.stack.splice(i, 1);
      if (entry?.token && !entry.canceled) {
        state.tokens.delete(entry.token);
      }
    }
  }
}

function getTopEntry(): CancellationEntry | null {
  cleanupStack();
  if (state.stack.length === 0) {
    return null;
  }
  return state.stack[state.stack.length - 1] ?? null;
}

function removeEntry(entry: CancellationEntry | null | undefined): void {
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

function markCanceled(entry: CancellationEntry | null | undefined, reason?: unknown): boolean {
  if (!entry || entry.canceled) {
    return false;
  }

  entry.canceled = true;
  entry.reason = (reason ?? null) as CancellationReason;

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

export type RegisterOptions = {
  description?: string;
  onCancel?: CancelCallback | null;
};

export type CancellationRegistration = {
  token: symbol;
  isCanceled: () => boolean;
  cancel: (reason?: unknown) => boolean;
  setCancelCallback: (fn: CancelCallback | null | undefined) => void;
  updateDescription: (desc: string) => void;
  unregister: () => void;
};

export function register({
  description = 'operation',
  onCancel,
}: RegisterOptions = {}): CancellationRegistration {
  cleanupStack();

  const token = Symbol('cancellation-operation');
  const entry: CancellationEntry = {
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

export function cancel(reason?: unknown): boolean {
  const active = getTopEntry();
  if (!active) {
    return false;
  }
  return markCanceled(active, reason);
}

export function isCanceled(token?: symbol): boolean {
  cleanupStack();
  if (token) {
    const entry = state.tokens.get(token);
    return entry ? entry.canceled : false;
  }
  const active = getTopEntry();
  return active ? active.canceled : false;
}

export function getActiveOperation(): CancellationEntry | null {
  return getTopEntry();
}

export default {
  register,
  cancel,
  isCanceled,
  getActiveOperation,
};
