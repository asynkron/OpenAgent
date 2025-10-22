import { RuntimeEventType } from '../contracts/events.js';
import type { RuntimeEvent } from './runtimeEvents.js';
import type { EmitRuntimeEventOptions } from './runtimeTypes.js';

export type EmitRuntimeEvent = (event: RuntimeEvent, options?: EmitRuntimeEventOptions) => void;

export const extractAssistantMessage = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export interface AssistantMessageEmitOptions {
  readonly state?: 'stream' | 'final';
}

export const emitAssistantMessageEvent = (
  emitEvent: EmitRuntimeEvent | null | undefined,
  value: unknown,
  options: AssistantMessageEmitOptions = {},
): void => {
  if (!emitEvent) {
    return;
  }

  const message = extractAssistantMessage(value);
  if (!message) {
    return;
  }

  emitEvent({
    type: RuntimeEventType.AssistantMessage,
    payload: {
      message,
      ...(options.state ? { state: options.state } : {}),
    },
  });
};
