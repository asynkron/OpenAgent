import { createWebSocketBinding, type WebSocketBinding } from '@asynkron/openagent-core';
import type { RawData, WebSocket } from 'ws';

import {
  describeAgentError,
  formatAgentEvent,
  isWebSocketOpen,
  normaliseAgentText,
} from './utils.js';

export interface AgentConfig {
  autoApprove: boolean;
}

export interface AgentPayload {
  type: string;
  [key: string]: unknown;
}

export interface AgentSocketManagerOptions {
  agentConfig: AgentConfig;
  sendPayload: (ws: WebSocket, payload: AgentPayload) => boolean;
}

interface AgentSocketRecord {
  binding: WebSocketBinding;
  cleaned: boolean;
  cleanup: ((reason?: string) => Promise<void>) | null;
}

export class AgentSocketManager {
  private readonly agentConfig: AgentConfig;

  private readonly sendPayload: (ws: WebSocket, payload: AgentPayload) => boolean;

  private readonly clients: Map<WebSocket, AgentSocketRecord> = new Map();

  constructor({ agentConfig, sendPayload }: AgentSocketManagerOptions) {
    this.agentConfig = agentConfig;
    this.sendPayload = sendPayload;
    // Track each websocket so we can cleanly tear down bindings on shutdown.
  }

  private buildRuntimeOptions(): { getAutoApproveFlag: () => boolean; emitAutoApproveStatus: boolean } | undefined {
    if (this.agentConfig?.autoApprove === false) {
      return undefined;
    }
    return {
      getAutoApproveFlag: () => true,
      emitAutoApproveStatus: true,
    };
  }

  handleConnection(ws: WebSocket): void {
    let binding: WebSocketBinding | undefined;
    console.log('Agent websocket connection received - initialising runtime binding');
    try {
      const runtimeOptions = this.buildRuntimeOptions();
      const bindingOptions: Parameters<typeof createWebSocketBinding>[0] = {
        socket: ws,
        autoStart: false,
        formatOutgoing: (event) => {
          console.log('Agent runtime emitted event', event);
          return formatAgentEvent(event);
        },
      };

      if (runtimeOptions) {
        bindingOptions.runtimeOptions = runtimeOptions;
      }

      binding = createWebSocketBinding(bindingOptions);
    } catch (error) {
      const details = describeAgentError(error);
      this.sendPayload(ws, {
        type: 'agent_error',
        message: 'Failed to initialize the agent runtime.',
        details,
      });
      try {
        ws.close(1011, 'Agent runtime unavailable');
      } catch (closeError) {
        console.warn('Failed to close agent websocket after initialization error', closeError);
      }
      return;
    }

    if (!binding) {
      return;
    }

    const record: AgentSocketRecord = {
      binding,
      cleaned: false,
      cleanup: null,
    };

    let cleanup: ((reason?: string) => Promise<void>) | undefined;

    const handleClose = (): void => {
      console.log('Agent websocket closed by client');
      void cleanup?.('socket-close');
    };

    const handleError = (socketError: unknown): void => {
      if (socketError instanceof Error && socketError.message) {
        console.warn('Agent websocket error', socketError);
      }
      void cleanup?.('socket-error');
    };

    cleanup = async (reason = 'socket-close'): Promise<void> => {
      if (record.cleaned) {
        return;
      }
      record.cleaned = true;
      this.clients.delete(ws);

      console.log('Cleaning up agent websocket binding', { reason });

      try {
        ws.off?.('close', handleClose);
        ws.off?.('error', handleError);
      } catch (error) {
        // Ignore listener removal failures; the socket may already be closed.
      }

      try {
        await binding?.stop?.({ reason });
      } catch (error) {
        console.warn('Failed to stop agent binding cleanly', error);
      }
    };

    record.cleanup = cleanup;
    this.clients.set(ws, record);

    ws.on('close', handleClose);
    ws.on('error', handleError);

    ws.on('message', (raw: RawData, isBinary: boolean) => {
      let serialized = '';
      if (typeof raw === 'string') {
        serialized = raw;
      } else if (Buffer.isBuffer(raw)) {
        serialized = raw.toString('utf8');
      } else if (Array.isArray(raw)) {
        serialized = Buffer.concat(raw).toString('utf8');
      } else if (!isBinary && raw instanceof ArrayBuffer) {
        serialized = Buffer.from(raw).toString('utf8');
      }

      console.log('Agent websocket received payload', serialized || raw);

      const runtime = binding.runtime;
      if (!serialized || !runtime?.submitPrompt) {
        return;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(serialized);
      } catch (error) {
        return;
      }

      if (!parsed || typeof parsed !== 'object') {
        return;
      }

      const type = typeof (parsed as { type?: unknown }).type === 'string'
        ? ((parsed as { type: string }).type.toLowerCase())
        : undefined;
      if (type !== 'chat' && type !== 'prompt') {
        return;
      }

      const source = parsed as Record<string, unknown>;
      const promptSource =
        source.prompt ??
        source.text ??
        source.value ??
        source.message;

      if (typeof promptSource === 'undefined') {
        return;
      }

      const prompt =
        typeof promptSource === 'string'
          ? promptSource.trim()
          : normaliseAgentText(promptSource).trim();

      if (!prompt) {
        return;
      }

      try {
        runtime.submitPrompt(prompt);
        console.log('Forwarded agent prompt payload to runtime queue');
      } catch (error) {
        console.warn('Failed to forward agent prompt payload to runtime queue', error);
      }
    });

    try {
      const startResult = binding.start?.();
      if (startResult && typeof (startResult as Promise<void>).then === 'function') {
        void (startResult as Promise<void>)
          .then(() => {
            console.log('Agent runtime reported async start completion');
          })
          .catch(async (startError: unknown) => {
            const details = describeAgentError(startError);
            this.sendPayload(ws, {
              type: 'agent_error',
              message: 'Agent runtime failed to start.',
              details,
            });
            await cleanup?.('runtime-error');
            try {
              ws.close(1011, 'Agent runtime failed to start');
            } catch (closeError) {
              console.warn('Failed to close agent websocket after runtime error', closeError);
            }
          });
      } else {
        console.log('Agent runtime started synchronously');
      }
    } catch (error) {
      const details = describeAgentError(error);
      this.sendPayload(ws, {
        type: 'agent_error',
        message: 'Agent runtime failed to start.',
        details,
      });
      void cleanup?.('runtime-error');
      try {
        ws.close(1011, 'Agent runtime failed to start');
      } catch (closeError) {
        console.warn('Failed to close agent websocket after synchronous runtime error', closeError);
      }
    }
  }

  async stopAll(reason: string = 'server-stop'): Promise<void> {
    const entries = Array.from(this.clients.entries());
    for (const [ws, record] of entries) {
      const binding = record.binding;
      if (record.cleanup) {
        try {
          await record.cleanup(reason);
        } catch (error) {
          console.warn('Failed to clean up agent binding', error);
        }
      } else if (binding) {
        try {
          await binding.stop?.({ reason });
        } catch (error) {
          console.warn('Failed to stop agent binding', error);
        }
      }

      try {
        ws.close();
      } catch (error) {
        console.warn('Failed to close agent websocket', error);
      }
    }
    this.clients.clear();
  }
}

export function sendAgentPayload(ws: WebSocket, payload: AgentPayload | null | undefined): boolean {
  if (!payload) {
    return false;
  }

  if (!isWebSocketOpen(ws)) {
    return false;
  }

  try {
    ws.send(JSON.stringify(payload));
    return true;
  } catch (error) {
    console.warn('Failed to send agent payload to client', error);
    return false;
  }
}
