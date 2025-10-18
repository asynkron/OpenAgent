import type { WebSocket } from 'ws';
import type { WebSocketBinding } from '@asynkron/openagent-core';

import { describeAgentError, type AgentPayload } from './utils.js';

export function startAgentRuntime(
  binding: WebSocketBinding,
  ws: WebSocket,
  sendPayload: (ws: WebSocket, payload: AgentPayload) => boolean,
  cleanup: (reason?: string) => Promise<void>,
): void {
  try {
    const startResult = binding.start?.();
    if (isPromise(startResult)) {
      void startResult
        .then(() => {
          console.log('Agent runtime reported async start completion');
        })
        .catch(async (startError: unknown) => {
          await handleRuntimeFailure(ws, sendPayload, cleanup, startError, 'runtime error');
        });
      return;
    }

    console.log('Agent runtime started synchronously');
  } catch (error) {
    void handleRuntimeFailure(ws, sendPayload, cleanup, error, 'synchronous runtime error');
  }
}

export function closeAgentSocket(
  ws: WebSocket,
  code: number,
  reason: string,
  warningContext: string,
): void {
  try {
    ws.close(code, reason);
  } catch (closeError) {
    console.warn(`Failed to close agent websocket after ${warningContext}`, closeError);
  }
}

function isPromise(value: unknown): value is Promise<void> {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const then = (value as { then?: unknown }).then;
  return typeof then === 'function';
}

async function handleRuntimeFailure(
  ws: WebSocket,
  sendPayload: (ws: WebSocket, payload: AgentPayload) => boolean,
  cleanup: (reason?: string) => Promise<void>,
  error: unknown,
  warningContext: string,
): Promise<void> {
  const details = describeAgentError(error);
  sendPayload(ws, {
    type: 'agent_error',
    message: 'Agent runtime failed to start.',
    ...(details ? { details } : {}),
  });

  await cleanup('runtime-error');
  closeAgentSocket(ws, 1011, 'Agent runtime failed to start', warningContext);
}
