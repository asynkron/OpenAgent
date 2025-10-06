import { jest } from '@jest/globals';
import { ESCAPE_EVENT } from '../../src/cli/io.js';
import { createEscState, createEscWaiter, resetEscState } from '../../src/agent/escState.js';

describe('createEscState', () => {
  test('returns noop detach when readline is missing', () => {
    const { state, detach } = createEscState(null);
    expect(state).toEqual({ triggered: false, payload: null, waiters: new Set() });
    expect(typeof detach).toBe('function');
    expect(() => detach()).not.toThrow();
  });

  test('wires ESC listener and resolves waiters', async () => {
    const listeners = new Map();
    const rl = {
      on: jest.fn((event, handler) => {
        listeners.set(event, handler);
      }),
      off: jest.fn((event, handler) => {
        if (listeners.get(event) === handler) {
          listeners.delete(event);
        }
      }),
    };

    const { state, detach } = createEscState(rl);

    expect(rl.on).toHaveBeenCalledTimes(1);
    const handler = listeners.get(ESCAPE_EVENT);
    expect(typeof handler).toBe('function');

    const { promise } = createEscWaiter(state);
    handler('payload');

    await expect(promise).resolves.toBe('payload');
    expect(state.triggered).toBe(true);
    expect(state.payload).toBe('payload');

    detach();
    expect(rl.off).toHaveBeenCalledWith(ESCAPE_EVENT, handler);
  });
});

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
