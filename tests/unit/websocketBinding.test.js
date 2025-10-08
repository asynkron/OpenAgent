import { jest } from '@jest/globals';

import { createWebSocketBinding } from '../../src/bindings/websocket.js';
import { AsyncQueue } from '../../src/utils/asyncQueue.js';

function createMockSocket() {
  const listeners = new Map();
  const api = {
    send: jest.fn(),
    on(event, handler) {
      const existing = listeners.get(event) ?? new Set();
      existing.add(handler);
      listeners.set(event, existing);
      return api;
    },
    off(event, handler) {
      const existing = listeners.get(event);
      if (!existing) return api;
      existing.delete(handler);
      if (existing.size === 0) {
        listeners.delete(event);
      }
      return api;
    },
    emit(event, ...args) {
      const callbacks = listeners.get(event);
      if (!callbacks) return;
      for (const cb of [...callbacks]) {
        cb(...args);
      }
    },
  };
  return api;
}

function createMockRuntime() {
  const outputs = new AsyncQueue();
  let resolveStart;
  const startPromise = new Promise((resolve) => {
    resolveStart = resolve;
  });
  return {
    runtime: {
      outputs,
      start: jest.fn(() => startPromise),
      submitPrompt: jest.fn(),
      cancel: jest.fn(),
    },
    outputs,
    resolveStart,
  };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('createWebSocketBinding', () => {
  test('forwards prompts and outbound events', async () => {
    const socket = createMockSocket();
    const { runtime, outputs, resolveStart } = createMockRuntime();

    const binding = createWebSocketBinding({
      socket,
      createRuntime: () => runtime,
      autoStart: false,
    });

    const startPromise = binding.start();
    await flush();
    expect(runtime.start).toHaveBeenCalledTimes(1);

    socket.emit('message', JSON.stringify({ type: 'prompt', prompt: 'hello' }));
    socket.emit('message', 'plain text prompt');

    expect(runtime.submitPrompt).toHaveBeenCalledWith('hello');
    expect(runtime.submitPrompt).toHaveBeenCalledWith('plain text prompt');

    socket.emit('message', JSON.stringify({ type: 'cancel', payload: { foo: 'bar' } }));
    expect(runtime.cancel).toHaveBeenCalledWith({ foo: 'bar' });

    outputs.push({ type: 'status', message: 'ready' });
    await flush();

    expect(socket.send).toHaveBeenCalled();
    const payload = socket.send.mock.calls[socket.send.mock.calls.length - 1][0];
    expect(JSON.parse(payload)).toEqual({ type: 'status', message: 'ready' });

    resolveStart();
    await binding.stop({ cancel: false });
    await startPromise;
  });

  test('cancels runtime when socket closes', async () => {
    const socket = createMockSocket();
    const { runtime, resolveStart } = createMockRuntime();

    const binding = createWebSocketBinding({
      socket,
      createRuntime: () => runtime,
      autoStart: false,
    });

    const startPromise = binding.start();
    await flush();

    socket.emit('close');
    await flush();

    expect(runtime.cancel).toHaveBeenCalledWith({ reason: 'socket-close' });

    resolveStart();
    await startPromise;
  });

  test('emits error event when parse fails', async () => {
    const socket = createMockSocket();
    const { runtime, resolveStart } = createMockRuntime();

    const binding = createWebSocketBinding({
      socket,
      createRuntime: () => runtime,
      autoStart: false,
      parseIncoming: () => {
        throw new Error('boom');
      },
    });

    const startPromise = binding.start();
    await flush();

    socket.emit('message', 'ignored');
    await flush();

    expect(socket.send).toHaveBeenCalled();
    const payload = socket.send.mock.calls[0][0];
    expect(JSON.parse(payload).type).toBe('error');

    resolveStart();
    await binding.stop({ cancel: false });
    await startPromise;
  });

  test('autoStart immediately begins runtime', async () => {
    const socket = createMockSocket();
    const { runtime, resolveStart } = createMockRuntime();

    createWebSocketBinding({
      socket,
      createRuntime: () => runtime,
      autoStart: true,
    });

    await flush();

    expect(runtime.start).toHaveBeenCalledTimes(1);

    resolveStart();
  });
});
