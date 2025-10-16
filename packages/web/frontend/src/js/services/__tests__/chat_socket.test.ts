import { jest } from '@jest/globals';
import { createChatSocketManager, type ChatSocketStatusUpdate } from '../chat_socket.js';
import type { AgentIncomingPayload } from '../chat_router.js';

class FakeWebSocket {
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly url: string;
  readyState: number = FakeWebSocket.OPEN;
  sent: string[] = [];
  private listeners: Map<string, Set<(event: Event) => void>> = new Map();

  constructor(url: string) {
    this.url = url;
  }

  addEventListener(type: string, listener: (event: Event) => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event: Event) => void): void {
    const listeners = this.listeners.get(type);
    if (!listeners) {
      return;
    }
    listeners.delete(listener);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.dispatch('close');
  }

  dispatch(type: string, event: Partial<MessageEvent<string>> = {}): void {
    const listeners = this.listeners.get(type);
    if (!listeners) {
      return;
    }
    for (const listener of listeners) {
      const payload = Object.assign({ currentTarget: this }, event);
      listener(payload as Event);
    }
  }
}

describe('createChatSocketManager', () => {
function createWindowStub() {
  const timers: Array<() => void> = [];
  const windowRef = {
    location: { protocol: 'http:', host: 'localhost' },
    setTimeout: ((handler: TimerHandler) => {
      const index = timers.length;
      timers.push(() => {
        if (typeof handler === 'function') {
          handler();
        }
      });
      return index;
    }) as unknown as Window['setTimeout'],
    clearTimeout: ((id?: number) => {
      if (typeof id === 'number' && timers[id]) {
        timers[id] = () => {};
      }
    }) as unknown as Window['clearTimeout'],
    WebSocket: FakeWebSocket as unknown as typeof WebSocket,
  } as Window & typeof globalThis;

  return {
    windowRef,
    flushTimers(): void {
      while (timers.length > 0) {
        const timer = timers.shift();
        timer?.();
      }
    },
  };
}

  it('reconnects after close events and reports status updates', () => {
    jest.useFakeTimers();

    const { windowRef, flushTimers } = createWindowStub();
    const statuses: ChatSocketStatusUpdate[] = [];
    const connections: boolean[] = [];
    const sockets: FakeWebSocket[] = [];

    const manager = createChatSocketManager({
      windowRef,
      reconnectDelay: 1,
      parsePayload: () => null,
      onStatus: (status) => {
        statuses.push(status);
      },
      onPayload: () => {},
      onConnectionChange: (connected) => {
        connections.push(connected);
      },
      createSocket: (url) => {
        const socket = new FakeWebSocket(url);
        sockets.push(socket);
        return socket as unknown as WebSocket;
      },
    });

    manager.connect();
    expect(statuses.at(-1)?.state).toBe('connecting');
    expect(sockets).toHaveLength(1);

    const firstSocket = sockets[0];
    firstSocket.readyState = FakeWebSocket.OPEN;
    firstSocket.dispatch('open');
    expect(statuses.at(-1)).toMatchObject({ state: 'connected', level: 'info' });
    expect(connections.at(-1)).toBe(true);

    firstSocket.readyState = FakeWebSocket.CLOSED;
    firstSocket.dispatch('close');
    expect(statuses.at(-1)).toMatchObject({ state: 'reconnecting', level: 'warn' });
    expect(connections.at(-1)).toBe(false);

    flushTimers();
    expect(sockets).toHaveLength(2);
    manager.dispose();
  });

  it('ignores messages from stale sockets', () => {
    const { windowRef, flushTimers } = createWindowStub();
    const sockets: FakeWebSocket[] = [];
    const payloads: AgentIncomingPayload[] = [];
    const parsePayload = jest.fn((value: unknown) => value as AgentIncomingPayload);

    const manager = createChatSocketManager({
      windowRef,
      reconnectDelay: 1,
      parsePayload,
      onStatus: () => {},
      onPayload: (payload) => {
        payloads.push(payload);
      },
      createSocket: (url) => {
        const socket = new FakeWebSocket(url);
        sockets.push(socket);
        return socket as unknown as WebSocket;
      },
    });

    manager.connect();
    const firstSocket = sockets[0];
    firstSocket.readyState = FakeWebSocket.OPEN;
    firstSocket.dispatch('open');

    firstSocket.readyState = FakeWebSocket.CLOSED;
    firstSocket.dispatch('close');

    flushTimers();
    const nextSocket = sockets[1];
    nextSocket.readyState = FakeWebSocket.OPEN;
    nextSocket.dispatch('open');

    const callsBefore = parsePayload.mock.calls.length;
    firstSocket.dispatch('message', {
      data: JSON.stringify({ type: 'agent_message', text: 'ignored' }),
    });
    expect(parsePayload).toHaveBeenCalledTimes(callsBefore);

    nextSocket.dispatch('message', {
      data: JSON.stringify({ type: 'agent_message', text: 'delivered' }),
    });
    expect(parsePayload).toHaveBeenCalledTimes(callsBefore + 1);
    expect(payloads).toEqual([
      { type: 'agent_message', text: 'delivered' } as AgentIncomingPayload,
    ]);

    manager.dispose();
  });
});
