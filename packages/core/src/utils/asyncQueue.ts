// @ts-nocheck
/**
 * Lightweight async queue used to model agent event streams.
 *
 * Implements a push-based buffer with backpressure via awaiting `next()`.
 */

const DONE = Symbol('async-queue-done');

/**
 * Tiny async queue class used by the runtime to shuttle events between the
 * agent loop and whichever UI is consuming them.
 */
export class AsyncQueue {
  constructor() {
    this.values = [];
    this.waiters = [];
    this.closed = false;
  }

  /**
   * Flush all queued waiters with the provided value.
   * The helper is shared by `push` and `close` so we keep the behaviour identical
   * to the previous closure-based implementation.
   * @param {*} value
   */
  flushWaiters(value) {
    while (this.waiters.length > 0) {
      const resolve = this.waiters.shift();
      try {
        resolve(value);
      } catch {
        // Ignore waiter resolution failures; downstream consumers decide.
      }
    }
  }

  /**
   * Enqueue a value, resolving a pending waiter immediately when present.
   * @param {*} value
   * @returns {boolean} Whether the value was accepted.
   */
  push(value) {
    if (this.closed) {
      return false;
    }
    if (this.waiters.length > 0) {
      this.flushWaiters(value);
    } else {
      this.values.push(value);
    }
    return true;
  }

  /**
   * Close the queue and notify any pending waiters.
   */
  close() {
    if (this.closed) return;
    this.closed = true;
    this.flushWaiters(DONE);
  }

  /**
   * Retrieve the next value, awaiting producers when necessary.
   * @returns {Promise<*>}
   */
  async next() {
    if (this.values.length > 0) {
      return this.values.shift();
    }
    if (this.closed) {
      return DONE;
    }
    return new Promise((resolve) => {
      this.waiters.push(resolve);
    });
  }

  /**
   * Allow `for await` iteration directly on the queue instance.
   */
  async *[Symbol.asyncIterator]() {
    while (true) {
      const value = await this.next();
      if (value === DONE) {
        return;
      }
      yield value;
    }
  }

  /**
   * Provide the sentinel for consumers that need to detect completion.
   */
  static get DONE() {
    return DONE;
  }
}

/**
 * Backwards-compatible factory for callers that still expect the helper
 * function. Internal consumers are moving to the class directly.
 */
export function createAsyncQueue() {
  return new AsyncQueue();
}

export const QUEUE_DONE = AsyncQueue.DONE;

export default { createAsyncQueue, QUEUE_DONE, AsyncQueue };
