import { EventEmitter } from 'node:events';
import type { WebSocket } from 'ws';
import { describe, expect, it, beforeEach, jest } from '@jest/globals';

describe('AgentSocketManager', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('wires the runtime binding with auto-approve enabled', async () => {
    const submitPrompt = jest.fn();
    const start = jest.fn();
    const stop = jest.fn();
    const createWebSocketBinding = jest.fn(() => ({
      runtime: { submitPrompt },
      start,
      stop,
    }));

    jest.unstable_mockModule('@asynkron/openagent-core', () => ({
      createWebSocketBinding,
    }));

    const { AgentSocketManager } = await import('../agentSocket.js');

    const sendPayload = jest.fn(() => true);
    const manager = new AgentSocketManager({
      agentConfig: { autoApprove: true },
      sendPayload,
    });

    const socket = new TestWebSocket();

    manager.handleConnection(socket as unknown as WebSocket);

    expect(createWebSocketBinding).toHaveBeenCalledTimes(1);
    const bindingOptions = createWebSocketBinding.mock.calls[0][0];

    expect(bindingOptions.runtimeOptions?.getAutoApproveFlag()).toBe(true);
    expect(bindingOptions.runtimeOptions?.emitAutoApproveStatus).toBe(true);

    const formatted = bindingOptions.formatOutgoing?.({ type: 'assistant-message', message: 'Hello' });
    expect(formatted).toBe(JSON.stringify({ type: 'agent_message', text: 'Hello' }));

    socket.emitMessage(JSON.stringify({ type: 'chat', prompt: '  hi there  ' }));
    expect(submitPrompt).toHaveBeenCalledWith('hi there');
  });

  it('omits runtime auto-approve options when disabled', async () => {
    const createWebSocketBinding = jest.fn(() => ({
      runtime: {},
    }));

    jest.unstable_mockModule('@asynkron/openagent-core', () => ({
      createWebSocketBinding,
    }));

    const { AgentSocketManager } = await import('../agentSocket.js');

    const manager = new AgentSocketManager({
      agentConfig: { autoApprove: false },
      sendPayload: () => true,
    });

    const socket = new TestWebSocket();
    manager.handleConnection(socket as unknown as WebSocket);

    expect(createWebSocketBinding).toHaveBeenCalledTimes(1);
    const bindingOptions = createWebSocketBinding.mock.calls[0][0];
    expect(bindingOptions.runtimeOptions).toBeUndefined();
  });
});

describe('sendAgentPayload', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('stringifies payloads before sending', async () => {
    jest.unstable_mockModule('@asynkron/openagent-core', () => ({
      createWebSocketBinding: jest.fn(),
    }));

    const { sendAgentPayload } = await import('../agentSocket.js');

    const socket = new TestWebSocket();
    const result = sendAgentPayload(socket as unknown as WebSocket, { type: 'agent_message', text: 'hi' });

    expect(result).toBe(true);
    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'agent_message', text: 'hi' }));
  });

  it('returns false when the socket is not open', async () => {
    jest.unstable_mockModule('@asynkron/openagent-core', () => ({
      createWebSocketBinding: jest.fn(),
    }));

    const { sendAgentPayload } = await import('../agentSocket.js');

    const socket = new TestWebSocket();
    socket.readyState = 0;

    expect(sendAgentPayload(socket as unknown as WebSocket, { type: 'agent_message', text: 'hi' })).toBe(false);
    expect(socket.send).not.toHaveBeenCalled();
  });

  it('ignores null payloads', async () => {
    jest.unstable_mockModule('@asynkron/openagent-core', () => ({
      createWebSocketBinding: jest.fn(),
    }));

    const { sendAgentPayload } = await import('../agentSocket.js');

    const socket = new TestWebSocket();
    expect(sendAgentPayload(socket as unknown as WebSocket, null)).toBe(false);
  });
});

class TestWebSocket extends EventEmitter {
  OPEN = 1 as const;
  readyState = this.OPEN;
  send = jest.fn(() => true);
  close = jest.fn();
  terminate = jest.fn();

  override on(event: string, listener: (...args: unknown[]) => void): this {
    super.on(event, listener);
    return this;
  }

  override off(event: string, listener: (...args: unknown[]) => void): this {
    super.off(event, listener);
    return this;
  }

  emitMessage(serialized: string): void {
    this.emit('message', serialized, false);
  }
}
