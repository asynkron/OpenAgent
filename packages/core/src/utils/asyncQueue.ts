/**
 * Lightweight async queue used to model agent event streams.
 *
 * Implements a push-based buffer with backpressure via awaiting `next()`.
 */

const DONE = Symbol('async-queue-done');

type QueueResolve<T> = (value: T | typeof DONE) => void;

/**
 * Tiny async queue class used by the runtime to shuttle events between the
 * agent loop and whichever UI is consuming them.
 */
export class AsyncQueue<T> implements AsyncIterable<T> {
  private readonly values: T[] = [];

  private readonly waiters: QueueResolve<T>[] = [];

  private closed = false;

  /**
   * Flush all queued waiters with the provided value.
   * The helper is shared by `push` and `close` so we keep the behaviour identical
   * to the previous closure-based implementation.
   */
  private flushWaiters(value: T | typeof DONE): void {
    while (this.waiters.length > 0) {
      const resolve = this.waiters.shift();
      if (!resolve) {
        continue;
      }

      try {
        resolve(value);
      } catch {
        // Ignore waiter resolution failures; downstream consumers decide.
      }
    }
  }

  /**
   * Enqueue a value, resolving a pending waiter immediately when present.
   * @returns Whether the value was accepted.
   */
  push(value: T): boolean {
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
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.flushWaiters(DONE);
  }

  /**
   * Retrieve the next value, awaiting producers when necessary.
   */
  async next(): Promise<T | typeof DONE> {
    if (this.values.length > 0) {
      return this.values.shift() as T;
    }
    if (this.closed) {
      return DONE;
    }
    return new Promise<T | typeof DONE>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  /**
   * Allow `for await` iteration directly on the queue instance.
   */
  async *[Symbol.asyncIterator](): AsyncIterator<T> {
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
  static get DONE(): typeof DONE {
    return DONE;
  }
}

/**
 * Backwards-compatible factory for callers that still expect the helper
 * function. Internal consumers are moving to the class directly.
 */
export function createAsyncQueue<T>(): AsyncQueue<T> {
  return new AsyncQueue<T>();
}

export const QUEUE_DONE = AsyncQueue.DONE;

const asyncQueue = { createAsyncQueue, QUEUE_DONE, AsyncQueue };

export default asyncQueue;
