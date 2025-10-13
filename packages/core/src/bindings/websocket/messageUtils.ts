import { isRecord } from './guards.js';

export interface IncomingStructuredMessage {
  type?: string;
  prompt?: unknown;
  value?: unknown;
  message?: unknown;
  cancel?: boolean;
  payload?: unknown;
  [key: string]: unknown;
}

export type ParsedIncomingMessage =
  | string
  | IncomingStructuredMessage
  | readonly unknown[]
  | null
  | undefined;

export interface ParseIncomingFn {
  (raw: unknown): ParsedIncomingMessage;
}

export type NormalizedIncomingEnvelope =
  | { kind: 'prompt'; prompt: string }
  | { kind: 'cancel'; payload?: unknown };

const textDecoder = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;

function decodeBinary(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value;

  if (typeof Buffer !== 'undefined' && Buffer.isBuffer?.(value)) {
    return value.toString('utf8');
  }

  if (typeof ArrayBuffer !== 'undefined') {
    if (value instanceof ArrayBuffer) {
      if (textDecoder) {
        return textDecoder.decode(new Uint8Array(value));
      }
      return String.fromCharCode(...new Uint8Array(value));
    }
    if (ArrayBuffer.isView?.(value)) {
      const view = value as ArrayBufferView;
      if (textDecoder) {
        return textDecoder.decode(view);
      }
      const buffer = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
      return String.fromCharCode(...buffer);
    }
  }

  return null;
}

function unwrapSocketMessage(raw: unknown): unknown {
  if (Array.isArray(raw)) {
    if (raw.length === 1) {
      return unwrapSocketMessage(raw[0]);
    }
    return raw;
  }

  if (!isRecord(raw)) {
    return raw;
  }

  if ('data' in raw) {
    return unwrapSocketMessage((raw as { data: unknown }).data);
  }

  return raw;
}

export const CANCEL_FALLBACK_REASON = 'socket-cancel';

function normalisePromptValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  return String(value);
}

export function normaliseIncomingMessage(
  parsed: ParsedIncomingMessage,
): NormalizedIncomingEnvelope | null {
  if (parsed == null) {
    return null;
  }

  if (typeof parsed === 'string') {
    return { kind: 'prompt', prompt: parsed };
  }

  if (!isRecord(parsed)) {
    return { kind: 'prompt', prompt: normalisePromptValue(parsed) };
  }

  const type = typeof parsed.type === 'string' ? parsed.type : undefined;

  if (type === 'cancel' || parsed.cancel === true) {
    return { kind: 'cancel', payload: parsed.payload ?? { reason: CANCEL_FALLBACK_REASON } };
  }

  if (
    type === 'prompt' ||
    type === 'input' ||
    type === 'message' ||
    type === 'user-input' ||
    typeof parsed.prompt !== 'undefined' ||
    typeof parsed.value !== 'undefined' ||
    typeof parsed.message !== 'undefined'
  ) {
    const prompt = normalisePromptValue(parsed.prompt ?? parsed.value ?? parsed.message);
    return { kind: 'prompt', prompt };
  }

  return null;
}

export const defaultParseIncoming: ParseIncomingFn = (raw) => {
  const value = unwrapSocketMessage(raw);
  if (value == null) {
    return null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return { type: 'prompt', prompt: '' } satisfies IncomingStructuredMessage;
    }
    try {
      return JSON.parse(value) as IncomingStructuredMessage;
    } catch {
      return { type: 'prompt', prompt: value } satisfies IncomingStructuredMessage;
    }
  }

  const decoded = decodeBinary(value);
  if (typeof decoded === 'string') {
    return defaultParseIncoming(decoded);
  }

  return value as ParsedIncomingMessage;
};
