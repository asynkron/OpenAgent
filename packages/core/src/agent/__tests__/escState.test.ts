/* eslint-env jest */
import { createEscState, createEscWaiter, resetEscState } from '../escState.js';
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
});
