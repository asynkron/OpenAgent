/**
 * Coordinates prompt requests coming from the agent runtime with responses
 * arriving from the UI layer. The previous implementation lived as an ad-hoc
 * closure inside `loop.js`; the class form makes the buffering behaviour easier
 * to exercise in isolation.
 */
export class PromptCoordinator {
  /**
   * @param {Object} options
   * @param {(event: Object) => void} options.emitEvent
   * @param {{ trigger?: Function }} [options.escState]
   * @param {(payload?: any) => void} [options.cancelFn]
   */
  constructor({ emitEvent, escState, cancelFn } = {}) {
    this.emitEvent = typeof emitEvent === 'function' ? emitEvent : () => {};
    this.escState = escState || null;
    this.cancelFn = typeof cancelFn === 'function' ? cancelFn : null;

    /** @type {string[]} */
    this.buffered = [];
    /** @type {Function[]} */
    this.waiters = [];
  }

  /**
   * Internal helper mirroring the old closure to resolve the next waiter.
   * @param {string} value
   * @returns {boolean}
   */
  resolveNext(value) {
    if (this.waiters.length > 0) {
      const resolve = this.waiters.shift();
      resolve(value);
      return true;
    }
    this.buffered.push(value);
    return false;
  }

  /**
   * Emit a prompt request to the UI and wait for a response.
   * @param {string} prompt
   * @param {Object} [metadata]
   * @returns {Promise<string>}
   */
  request(prompt, metadata = {}) {
    this.emitEvent({ type: 'request-input', prompt, metadata });

    if (this.buffered.length > 0) {
      return Promise.resolve(this.buffered.shift());
    }

    return new Promise((resolve) => {
      this.waiters.push(resolve);
    });
  }

  /**
   * Accept a prompt value from the UI, resolving a pending request if present.
   * @param {string} value
   */
  handlePrompt(value) {
    this.resolveNext(typeof value === 'string' ? value : '');
  }

  /**
   * Cancel pending work when the UI asks for a stop.
   * @param {any} payload
   */
  handleCancel(payload = null) {
    if (this.cancelFn) {
      this.cancelFn('ui-cancel');
    }
    this.escState?.trigger?.(payload ?? { reason: 'ui-cancel' });
    this.emitEvent({ type: 'status', level: 'warn', message: 'Cancellation requested by UI.' });
  }

  /**
   * Resolve all pending waiters to release consumers.
   */
  close() {
    while (this.waiters.length > 0) {
      const resolve = this.waiters.shift();
      resolve('');
    }
  }
}

export default PromptCoordinator;
