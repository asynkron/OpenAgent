import type { RawData } from 'ws';
import type { WebSocketBinding } from '@asynkron/openagent-core';

import { normaliseAgentText } from './utils.js';

interface AgentPromptMessage {
  type: string;
  prompt?: unknown;
  text?: unknown;
  value?: unknown;
  message?: unknown;
}

export function registerAgentMessageHandler(binding: WebSocketBinding, onMessage: (listener: (raw: RawData, isBinary: boolean) => void) => void): void {
  const runtime = binding.runtime;
  const listener = (raw: RawData, isBinary: boolean): void => {
    const serialized = serialiseIncomingMessage(raw, isBinary);
    console.log('Agent websocket received payload', serialized ?? raw);

    if (!serialized || !runtime?.submitPrompt) {
      return;
    }

    const prompt = extractPrompt(serialized);
    if (!prompt) {
      return;
    }

    try {
      runtime.submitPrompt(prompt);
      console.log('Forwarded agent prompt payload to runtime queue');
    } catch (error) {
      console.warn('Failed to forward agent prompt payload to runtime queue', error);
    }
  };

  onMessage(listener);
}

function serialiseIncomingMessage(raw: RawData, isBinary: boolean): string | undefined {
  if (typeof raw === 'string') {
    return raw;
  }

  if (Buffer.isBuffer(raw)) {
    return raw.toString('utf8');
  }

  if (Array.isArray(raw)) {
    return Buffer.concat(raw).toString('utf8');
  }

  if (!isBinary && raw instanceof ArrayBuffer) {
    return Buffer.from(raw).toString('utf8');
  }

  return undefined;
}

function extractPrompt(serialized: string): string | undefined {
  const parsed = parseMessage(serialized);
  if (!parsed) {
    return undefined;
  }

  if (!isAgentPromptMessage(parsed)) {
    return undefined;
  }

  return resolvePrompt(parsed);
}

function parseMessage(serialized: string): unknown {
  try {
    return JSON.parse(serialized);
  } catch (_error) {
    return undefined;
  }
}

function isAgentPromptMessage(value: unknown): value is AgentPromptMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const type = (value as { type?: unknown }).type;
  if (typeof type !== 'string') {
    return false;
  }

  const normalizedType = type.toLowerCase();
  return normalizedType === 'chat' || normalizedType === 'prompt';
}

function resolvePrompt(message: AgentPromptMessage): string | undefined {
  const promptSource = message.prompt ?? message.text ?? message.value ?? message.message;

  if (typeof promptSource === 'string') {
    const trimmed = promptSource.trim();
    return trimmed ? trimmed : undefined;
  }

  const normalised = normaliseAgentText(promptSource).trim();
  return normalised ? normalised : undefined;
}
