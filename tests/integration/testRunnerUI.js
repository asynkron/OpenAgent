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
      events.push(event);
      notifyListeners(event);

      if (event.type === 'request-input') {
        const scope = event.metadata?.scope ?? INPUT_SCOPES.USER;
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
