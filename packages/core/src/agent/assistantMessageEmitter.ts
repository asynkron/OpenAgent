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

export const emitAssistantMessageEvent = (
  emitEvent: EmitRuntimeEvent | null | undefined,
  value: unknown,
): void => {
  if (!emitEvent) {
    return;
  }

  const message = extractAssistantMessage(value);
  if (!message) {
    return;
  }

  emitEvent({
    type: 'assistant-message',
    payload: {
      message,
    },
  });
};
