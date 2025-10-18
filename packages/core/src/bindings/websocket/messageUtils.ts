import { isRecord } from './guards.js';

type PromptValue = string | number | boolean | null | undefined;

export interface IncomingStructuredMessage {
  type?: string;
  prompt?: PromptValue;
  value?: PromptValue;
  message?: PromptValue;
  cancel?: boolean;
  payload?: Record<string, unknown> | null | undefined;
}

type ParsedIncomingArray = readonly (IncomingStructuredMessage | PromptValue)[];

type BinaryPayload =
  | ArrayBuffer
  | ArrayBufferView
  | Buffer
  | { buffer: ArrayBuffer; byteOffset: number; byteLength: number };

export type ParsedIncomingMessage =
  | string
  | IncomingStructuredMessage
  | ParsedIncomingArray
  | BinaryPayload
  | null
  | undefined;

export interface ParseIncomingFn {
  (raw: unknown): ParsedIncomingMessage;
}

export type NormalizedIncomingEnvelope =
  | { kind: 'prompt'; prompt: string }
  | { kind: 'cancel'; payload?: unknown };

const textDecoder = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;

const isBinaryPayload = (value: ParsedIncomingMessage): value is BinaryPayload => {
  if (value == null) {
    return false;
  }

  if (typeof Buffer !== 'undefined' && Buffer.isBuffer?.(value)) {
    return true;
  }

  if (typeof ArrayBuffer !== 'undefined') {
    if (value instanceof ArrayBuffer) {
      return true;
    }

    if (ArrayBuffer.isView?.(value)) {
      return true;
    }
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'buffer' in value &&
    'byteOffset' in value &&
    'byteLength' in value
  ) {
    return true;
  }

  return false;
};

function decodeBinary(value: ParsedIncomingMessage): string | null {
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

  if (
    typeof value === 'object' &&
    value !== null &&
    'buffer' in value &&
    'byteOffset' in value &&
    'byteLength' in value
  ) {
    const bufferView = new Uint8Array(
      (value.buffer as ArrayBuffer) ?? new ArrayBuffer(0),
      Number(value.byteOffset ?? 0),
      Number(value.byteLength ?? 0),
    );
    if (textDecoder) {
      return textDecoder.decode(bufferView);
    }
    return String.fromCharCode(...bufferView);
  }

  return null;
}

function unwrapSocketMessage(raw: unknown): ParsedIncomingMessage {
  if (Array.isArray(raw)) {
    if (raw.length === 1) {
      return unwrapSocketMessage(raw[0]);
    }
    return raw as ParsedIncomingArray;
  }

  if (!isRecord(raw)) {
    return raw as ParsedIncomingMessage;
  }

  if ('data' in raw) {
    return unwrapSocketMessage((raw as { data: unknown }).data);
  }

  return raw as IncomingStructuredMessage;
}

export const CANCEL_FALLBACK_REASON = 'socket-cancel';

function normalisePromptValue(value: PromptValue): string {
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

  if (Array.isArray(parsed)) {
    return { kind: 'prompt', prompt: String(parsed) };
  }

  if (isBinaryPayload(parsed)) {
    return null;
  }

  if (!isRecord(parsed)) {
    return { kind: 'prompt', prompt: normalisePromptValue(parsed as PromptValue) };
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
    const prompt = normalisePromptValue(
      (parsed.prompt ?? parsed.value ?? parsed.message) as PromptValue,
    );
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

  return value;
};
