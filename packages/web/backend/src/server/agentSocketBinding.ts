import { createWebSocketBinding, type WebSocketBinding } from '@asynkron/openagent-core';
import type { WebSocket } from 'ws';

import { describeAgentError, formatAgentEvent, type AgentPayload } from './utils.js';
import type { AgentConfig } from './agentSocket.js';

export interface AgentBindingResult {
  binding: WebSocketBinding | null;
  errorPayload?: AgentPayload;
  closeReason?: string;
  closeWarningContext?: string;
}

export function initialiseAgentBinding(
  ws: WebSocket,
  agentConfig: AgentConfig,
): AgentBindingResult {
  try {
    const bindingOptions = createBindingOptions(ws, agentConfig);
    const binding = createWebSocketBinding(bindingOptions);
    return { binding };
  } catch (error) {
    const details = describeAgentError(error);
    return {
      binding: null,
      errorPayload: {
        type: 'agent_error',
        message: 'Failed to initialize the agent runtime.',
        ...(details ? { details } : {}),
      },
      closeReason: 'Agent runtime unavailable',
      closeWarningContext: 'initialization error',
    };
  }
}

function createBindingOptions(
  ws: WebSocket,
  agentConfig: AgentConfig,
): Parameters<typeof createWebSocketBinding>[0] {
  const bindingOptions: Parameters<typeof createWebSocketBinding>[0] = {
    socket: ws,
    autoStart: false,
    formatOutgoing: (event) => {
      console.log('Agent runtime emitted event', event);
      const payload = formatAgentEvent(event);
      return payload ? JSON.stringify(payload) : undefined;
    },
  };

  const runtimeOptions = buildRuntimeOptions(agentConfig);
  if (runtimeOptions) {
    bindingOptions.runtimeOptions = runtimeOptions;
  }

  return bindingOptions;
}

function buildRuntimeOptions(
  agentConfig: AgentConfig,
): { getAutoApproveFlag: () => boolean; emitAutoApproveStatus: boolean } | undefined {
  if (agentConfig?.autoApprove === false) {
    return undefined;
  }

  return {
    getAutoApproveFlag: () => true,
    emitAutoApproveStatus: true,
  };
}
