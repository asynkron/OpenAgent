import { createEscState, createEscWaiter, resetEscState } from '../../src/agent/escState.js';

describe('createEscState', () => {
  test('returns state with trigger and detach', () => {
    const { state, trigger, detach } = createEscState();
    expect(state.triggered).toBe(false);
    expect(typeof trigger).toBe('function');
    expect(typeof detach).toBe('function');
    trigger('payload');
    expect(state.triggered).toBe(true);
    expect(state.payload).toBe('payload');
    expect(() => detach()).not.toThrow();
  });

  test('waiters resolve when trigger invoked', async () => {
    const { state, trigger } = createEscState();
    const { promise } = createEscWaiter(state);
    trigger('value');
    await expect(promise).resolves.toBe('value');
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
