import { describe, expect, jest, test } from '@jest/globals';

import {
  createEscState,
  createEscWaiter,
  resetEscState,
  setEscActivePromise,
  clearEscActivePromise,
  getEscActivePromise,
} from '../escState.js';
import type { EscPayload } from '../escState.js';

describe('createEscState', () => {
  test('returns state with trigger and detach', () => {
    const { state, trigger, detach } = createEscState();
    expect(state.triggered).toBe(false);
    expect(typeof trigger).toBe('function');
    expect(typeof detach).toBe('function');
    const payload: EscPayload = 'payload';
    trigger(payload);
    expect(state.triggered).toBe(true);
    expect(state.payload).toBe('payload');
    expect(() => detach()).not.toThrow();
  });

  test('waiters resolve when trigger invoked', async () => {
    const { state, trigger } = createEscState();
    const { promise } = createEscWaiter(state);
    const payload: EscPayload = 'value';
    trigger(payload);
    await expect(promise).resolves.toBe(payload);
  });

  test('trigger cancels the active promise', () => {
    const { state, trigger } = createEscState();
    const cancel = jest.fn();
    const trackedPromise = Promise.resolve(null);

    setEscActivePromise(state, {
      promise: trackedPromise,
      cancel,
    });

    expect(getEscActivePromise(state)).not.toBeNull();

    trigger({ reason: 'escape-key' });

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(getEscActivePromise(state)).toBeNull();
  });
});

describe('resetEscState', () => {
  test('resets triggered flag and payload', () => {
    const { state, trigger } = createEscState();
    trigger('payload');
    expect(state.triggered).toBe(true);
    resetEscState(state);
    expect(state.triggered).toBe(false);
    expect(state.payload).toBe(null);
  });

  test('clears any tracked active promise', () => {
    const { state } = createEscState();
    const trackedPromise = Promise.resolve(null);

    setEscActivePromise(state, {
      promise: trackedPromise,
      cancel: () => {},
    });

    expect(getEscActivePromise(state)).not.toBeNull();

    resetEscState(state);

    expect(getEscActivePromise(state)).toBeNull();
  });

  test('clearEscActivePromise removes tracked promise without resetting state', () => {
    const { state } = createEscState();
    const trackedPromise = Promise.resolve(null);

    setEscActivePromise(state, {
      promise: trackedPromise,
      cancel: null,
    });

    expect(getEscActivePromise(state)).not.toBeNull();

    clearEscActivePromise(state);

    expect(getEscActivePromise(state)).toBeNull();
    expect(state.triggered).toBe(false);
    expect(state.payload).toBeNull();
  });
});
