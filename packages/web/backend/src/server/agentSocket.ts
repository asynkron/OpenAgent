import { createWebSocketBinding, type WebSocketBinding } from '@asynkron/openagent-core';
import type { RawData, WebSocket } from 'ws';

import { describeAgentError, formatAgentEvent, isWebSocketOpen, type AgentPayload } from './utils.js';
import { handleIncomingAgentMessage } from './agentSocketMessage.js';

export interface AgentConfig {
  autoApprove: boolean;
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

  private buildRuntimeOptions():
    | { getAutoApproveFlag: () => boolean; emitAutoApproveStatus: boolean }
    | undefined {
    if (this.agentConfig?.autoApprove === false) {
      return undefined;
    }
    return {
      getAutoApproveFlag: () => true,
      emitAutoApproveStatus: true,
    };
  }

  handleConnection(ws: WebSocket): void {
    console.log('Agent websocket connection received - initialising runtime binding');
    const binding = this.createBinding(ws);
    if (!binding) {
      return;
    }

    const record = this.registerClient(ws, binding);
    if (!record.cleanup) {
      return;
    }

    this.startBinding(ws, binding, record.cleanup);
  }

  private createBinding(ws: WebSocket): WebSocketBinding | null {
    try {
      const runtimeOptions = this.buildRuntimeOptions();
      const bindingOptions: Parameters<typeof createWebSocketBinding>[0] = {
        socket: ws,
        autoStart: false,
        formatOutgoing: (event) => {
          console.log('Agent runtime emitted event', event);
          const payload = formatAgentEvent(event);
          return payload ? JSON.stringify(payload) : undefined;
        },
      };

      if (runtimeOptions) {
        bindingOptions.runtimeOptions = runtimeOptions;
      }

      return createWebSocketBinding(bindingOptions);
    } catch (error) {
      const details = describeAgentError(error);
      this.sendPayload(ws, {
        type: 'agent_error',
        message: 'Failed to initialize the agent runtime.',
        ...(details ? { details } : {}),
      });
      try {
        ws.close(1011, 'Agent runtime unavailable');
      } catch (closeError) {
        console.warn('Failed to close agent websocket after initialization error', closeError);
      }
      return null;
    }
  }

  private registerClient(ws: WebSocket, binding: WebSocketBinding): AgentSocketRecord {
    const record: AgentSocketRecord = {
      binding,
      cleaned: false,
      cleanup: null,
    };

    const handleClose = (): void => {
      console.log('Agent websocket closed by client');
      void record.cleanup?.('socket-close');
    };

    const handleError = (socketError: unknown): void => {
      if (socketError instanceof Error && socketError.message) {
        console.warn('Agent websocket error', socketError);
      }
      void record.cleanup?.('socket-error');
    };

    record.cleanup = this.createCleanup(ws, record, handleClose, handleError);
    this.clients.set(ws, record);

    ws.on('close', handleClose);
    ws.on('error', handleError);
    ws.on('message', (raw: RawData, isBinary: boolean) => {
      handleIncomingAgentMessage(binding, raw, isBinary);
    });

    return record;
  }

  private createCleanup(
    ws: WebSocket,
    record: AgentSocketRecord,
    handleClose: () => void,
    handleError: (socketError: unknown) => void,
  ): (reason?: string) => Promise<void> {
    return async (reason = 'socket-close'): Promise<void> => {
      if (record.cleaned) {
        return;
      }
      record.cleaned = true;
      this.clients.delete(ws);

      console.log('Cleaning up agent websocket binding', { reason });

      try {
        ws.off?.('close', handleClose);
        ws.off?.('error', handleError);
      } catch (_error) {
        // Ignore listener removal failures; the socket may already be closed.
      }

      try {
        await record.binding?.stop?.({ reason });
      } catch (error) {
        console.warn('Failed to stop agent binding cleanly', error);
      }
    };
  }

  private startBinding(
    ws: WebSocket,
    binding: WebSocketBinding,
    cleanup: (reason?: string) => Promise<void>,
  ): void {
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
              ...(details ? { details } : {}),
            });
            await cleanup('runtime-error');
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
        ...(details ? { details } : {}),
      });
      void cleanup('runtime-error');
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
