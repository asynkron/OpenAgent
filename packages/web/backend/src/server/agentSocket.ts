import type { WebSocketBinding } from '@asynkron/openagent-core';
import type { WebSocket } from 'ws';

import { isWebSocketOpen, type AgentPayload } from './utils.js';
import { initialiseAgentBinding } from './agentSocketBinding.js';
import { registerAgentMessageHandler } from './agentSocketMessages.js';
import { createCleanupBundle, registerLifecycleHandlers } from './agentSocketLifecycle.js';
import { closeAgentSocket, startAgentRuntime } from './agentSocketRuntime.js';

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
    this.sendPayload = sendPayload;
    this.agentConfig = agentConfig;
    // Track each websocket so we can cleanly tear down bindings on shutdown.
  }

  handleConnection(ws: WebSocket): void {
    console.log('Agent websocket connection received - initialising runtime binding');
    const { binding, errorPayload, closeReason, closeWarningContext } = initialiseAgentBinding(
      ws,
      this.agentConfig,
    );

    if (!binding) {
      if (errorPayload) {
        this.sendPayload(ws, errorPayload);
      }

      if (closeReason && closeWarningContext) {
        closeAgentSocket(ws, 1011, closeReason, closeWarningContext);
      }
      return;
    }

    const record: AgentSocketRecord = {
      binding,
      cleaned: false,
      cleanup: null,
    };

    const removeClient = (): void => {
      this.clients.delete(ws);
    };

    const lifecycle = createCleanupBundle(ws, record, removeClient, binding);
    record.cleanup = lifecycle.cleanup;
    this.clients.set(ws, record);

    registerLifecycleHandlers(ws, lifecycle);
    registerAgentMessageHandler(binding, (listener) => {
      ws.on('message', listener);
    });

    startAgentRuntime(binding, ws, this.sendPayload, lifecycle.cleanup);
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
