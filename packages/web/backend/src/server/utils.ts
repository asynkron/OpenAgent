import type { WebSocket } from 'ws';
import {
  normaliseAgentText,
  serialiseAgentRuntimeEvent,
} from '@asynkron/openagent-web-core';

export { normaliseAgentText };

export function formatAgentEvent(event: unknown): string | undefined {
  return serialiseAgentRuntimeEvent(event);
}

export function describeAgentError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === 'string' ? error : 'Unknown error';
}

export function isWebSocketOpen(ws: WebSocket | null | undefined): ws is WebSocket {
  return Boolean(ws && ws.readyState === ws.OPEN);
}
