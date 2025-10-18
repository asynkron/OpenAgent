import type { WebSocketBinding } from '@asynkron/openagent-core';
import type { RawData } from 'ws';

import { normaliseAgentText } from './utils.js';

interface AgentPromptMessage {
  type: string;
  prompt?: unknown;
  text?: unknown;
  value?: unknown;
  message?: unknown;
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

function isAgentPromptMessage(value: unknown): value is AgentPromptMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const type = (value as { type?: unknown }).type;
  if (typeof type !== 'string') {
    return false;
  }

  const normalizedType = type.toLowerCase();
  if (normalizedType !== 'chat' && normalizedType !== 'prompt') {
    return false;
  }

  return true;
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

export function handleIncomingAgentMessage(
  binding: WebSocketBinding,
  raw: RawData,
  isBinary: boolean,
): void {
  const serialised = serialiseIncomingMessage(raw, isBinary);
  console.log('Agent websocket received payload', serialised ?? raw);

  const runtime = binding.runtime;
  if (!serialised || !runtime?.submitPrompt) {
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialised);
  } catch (_error) {
    return;
  }

  if (!isAgentPromptMessage(parsed)) {
    return;
  }

  const prompt = resolvePrompt(parsed);
  if (!prompt) {
    return;
  }

  try {
    runtime.submitPrompt(prompt);
    console.log('Forwarded agent prompt payload to runtime queue');
  } catch (error) {
    console.warn('Failed to forward agent prompt payload to runtime queue', error);
  }
}
