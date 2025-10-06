/**
 * Lightweight async queue used to model agent event streams.
 *
 * Implements a push-based buffer with backpressure via awaiting `next()`.
 */

const DONE = Symbol('async-queue-done');

export function createAsyncQueue() {
  const values = [];
  const waiters = [];
  let closed = false;

  function flushWaiters(value) {
    while (waiters.length > 0) {
      const resolve = waiters.shift();
      try {
        resolve(value);
      } catch {
        // Ignore waiter resolution failures; downstream consumers decide.
      }
    }
  }

  function push(value) {
    if (closed) {
      return false;
    }
    if (waiters.length > 0) {
      flushWaiters(value);
    } else {
      values.push(value);
    }
    return true;
  }

  function close() {
    if (closed) return;
    closed = true;
    flushWaiters(DONE);
  }

  async function next() {
    if (values.length > 0) {
      return values.shift();
    }
    if (closed) {
      return DONE;
    }
    return new Promise((resolve) => {
      waiters.push(resolve);
    });
  }

  async function *iterate() {
    while (true) {
      const value = await next();
      if (value === DONE) {
        return;
      }
      yield value;
    }
  }

  return {
    push,
    close,
    next,
    [Symbol.asyncIterator]: iterate,
  };
}

export const QUEUE_DONE = DONE;

export default { createAsyncQueue, QUEUE_DONE };
