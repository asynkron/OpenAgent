import type { PromptRequestMetadata } from '@asynkron/openagent-core';

// Minimal reactive UI harness used by integration tests to drive the agent runtime.
export const INPUT_SCOPES = {
  USER: 'user-input',
  APPROVAL: 'approval',
  ANY: '*',
};

function createQueueMap() {
  return new Map([
    [INPUT_SCOPES.USER, []],
    [INPUT_SCOPES.ANY, []],
  ]);
}

function toLegacyEvent(event: unknown): unknown {
  if (!event || typeof event !== 'object') {
    return event;
  }
  const e = event as { type?: unknown; payload?: unknown } & Record<string, unknown>;
  const type = typeof e.type === 'string' ? e.type : '';
  const payload = e.payload && typeof e.payload === 'object' ? (e.payload as Record<string, unknown>) : null;
  if (!payload) {
    return event;
  }
  switch (type) {
    case 'status': {
      return { ...e, ...payload };
    }
    case 'plan': {
      return { ...e, ...payload };
    }
    case 'command-result': {
      return { ...e, ...payload };
    }
    case 'request-input': {
      return { ...e, ...payload };
    }
    case 'error': {
      return { ...e, ...payload };
    }
    case 'context-usage': {
      return { ...e, ...payload };
    }
    case 'plan-progress': {
      return { ...e, ...payload };
    }
    default:
      return event;
  }
}

export function createTestRunnerUI(runtime, { onEvent } = {}) {
  const events = [];
  const responseQueues = createQueueMap();
  const pendingResolvers = [];
  const eventListeners = new Set();

  if (typeof onEvent === 'function') {
    eventListeners.add(onEvent);
  }

  const getQueue = (scope) => {
    if (!responseQueues.has(scope)) {
      responseQueues.set(scope, []);
    }
    return responseQueues.get(scope);
  };

  const notifyListeners = (event) => {
    for (const listener of eventListeners) {
      listener(event);
    }
  };

  const flushResolvers = () => {
    let index = 0;
    while (index < pendingResolvers.length) {
      const { scope, resolve } = pendingResolvers[index];
      const scopedQueue = getQueue(scope);
      const anyQueue = getQueue(INPUT_SCOPES.ANY);

      if (scopedQueue.length > 0) {
        pendingResolvers.splice(index, 1);
        resolve(scopedQueue.shift());
        continue;
      }

      if (anyQueue.length > 0) {
        pendingResolvers.splice(index, 1);
        resolve(anyQueue.shift());
        continue;
      }

      index += 1;
    }
  };

  const enqueueResponse = (value, scope = INPUT_SCOPES.USER) => {
    getQueue(scope).push(value);
    flushResolvers();
  };

  const enqueueMany = (scope, values) => {
    values.forEach((value) => enqueueResponse(value, scope));
  };

  const waitForResponse = (scope = INPUT_SCOPES.USER) => {
    const scopedQueue = getQueue(scope);
    if (scopedQueue.length > 0) {
      return Promise.resolve(scopedQueue.shift());
    }

    const anyQueue = getQueue(INPUT_SCOPES.ANY);
    if (anyQueue.length > 0) {
      return Promise.resolve(anyQueue.shift());
    }

    return new Promise((resolve) => {
      pendingResolvers.push({ scope, resolve });
    });
  };

  const processOutputs = async () => {
    for await (const event of runtime.outputs) {
      const legacy = toLegacyEvent(event);
      events.push(legacy);
      notifyListeners(legacy as { type: string });

      if ((legacy as { type?: string }).type === 'request-input') {
        const metadata = (legacy as { metadata?: PromptRequestMetadata | null }).metadata;
        const scope = metadata?.scope ?? INPUT_SCOPES.USER;
        const response = await waitForResponse(scope);
        runtime.submitPrompt(response ?? '');
      }
    }

    while (pendingResolvers.length > 0) {
      const { resolve } = pendingResolvers.shift();
      resolve('');
    }
  };

  const outputsPromise = processOutputs();

  return {
    get events() {
      return events;
    },
    queueUserInput: (...values) => enqueueMany(INPUT_SCOPES.USER, values),
    queueApprovalResponse: (...values) => enqueueMany(INPUT_SCOPES.APPROVAL, values),
    queueAnyResponse: (...values) => enqueueMany(INPUT_SCOPES.ANY, values),
    queueResponse: (value, scope) => enqueueResponse(value, scope ?? INPUT_SCOPES.USER),
    start: async () => {
      await runtime.start();
      await outputsPromise;
    },
    cancel: (payload = null) => runtime.cancel(payload),
    addEventListener: (listener) => {
      if (typeof listener === 'function') {
        eventListeners.add(listener);
        return () => eventListeners.delete(listener);
      }
      return () => {};
    },
  };
}
