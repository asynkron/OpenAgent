import { createEscWaiter, resetEscState } from '../../src/agent/escState.js';

describe('createEscWaiter', () => {
  test('returns null promise when escState is invalid', () => {
    const { promise, cleanup } = createEscWaiter(null);
    expect(promise).toBeNull();
    expect(typeof cleanup).toBe('function');
  });

  test('resolves immediately when esc already triggered', async () => {
    const escState = { triggered: true, payload: 'data' };
    const { promise } = createEscWaiter(escState);
    await expect(promise).resolves.toBe('data');
  });

  test('registers resolver when ESC not triggered yet', async () => {
    const waiters = new Set();
    const escState = { triggered: false, payload: null, waiters };

    const { promise, cleanup } = createEscWaiter(escState);
    expect(waiters.size).toBe(1);

    const resolver = [...waiters][0];
    resolver('hello');

    await expect(promise).resolves.toBe('hello');

    cleanup();
    expect(waiters.size).toBe(0);
  });
});

describe('resetEscState', () => {
  test('resets triggered flag and payload', () => {
    const escState = { triggered: true, payload: 'payload' };
    resetEscState(escState);
    expect(escState).toEqual({ triggered: false, payload: null });
  });

  test('handles invalid input safely', () => {
    expect(() => resetEscState(null)).not.toThrow();
  });
});
