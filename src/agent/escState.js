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
