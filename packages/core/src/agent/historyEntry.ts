// @ts-nocheck
/**
 * Conversation history helpers shared across the agent runtime.
 *
 * Responsibilities:
 * - Normalize chat history entries into a consistent payload structure.
 * - Project the normalized history into the OpenAI Responses API shape.
 *
 * Consumers:
 * - History compaction, pass execution, and OpenAI request builders.
 *
 * Note: The runtime still imports the compiled `historyEntry.js`; run `tsc` to
 * regenerate it after editing this source until the build pipeline emits from
 * TypeScript directly.
 */

const DEFAULT_EVENT_TYPE = 'chat-message' as const;

export type JsonLikeObject = Record<string, unknown>;

export type ChatMessagePayload = JsonLikeObject & {
  role?: string;
  content?: unknown;
};

export interface ChatMessageEntryInput extends JsonLikeObject {
  eventType?: string | null;
  payload?: ChatMessagePayload | null;
  role?: string;
  content?: unknown;
}

export interface ChatMessageEntry extends JsonLikeObject {
  eventType: string;
  payload: ChatMessagePayload;
  role?: string;
  content?: unknown;
}

export interface OpenAIMessage {
  role: string;
  content: unknown;
}

const buildPayload = ({ role, content }: ChatMessagePayload): ChatMessagePayload => {
  const payload: ChatMessagePayload = {};

  if (typeof role !== 'undefined') {
    payload.role = role;
  }

  if (typeof content !== 'undefined') {
    payload.content = content;
  }

  return payload;
};

export function createChatMessageEntry(entry: ChatMessageEntryInput = {}): ChatMessageEntry {
  if (!entry || typeof entry !== 'object') {
    throw new TypeError('Chat history entry must be an object.');
  }

  const { eventType, payload: providedPayload, ...rest } = entry;
  const normalizedEventType =
    typeof eventType === 'string' && eventType.trim() ? eventType : DEFAULT_EVENT_TYPE;

  const payloadFromEntry =
    providedPayload && typeof providedPayload === 'object'
      ? (providedPayload as ChatMessagePayload)
      : undefined;

  const role =
    (typeof rest.role === 'string' ? rest.role : undefined) ??
    (payloadFromEntry && typeof payloadFromEntry.role === 'string'
      ? payloadFromEntry.role
      : undefined);

  const hasContent = Object.prototype.hasOwnProperty.call(rest, 'content');
  const content = hasContent
    ? rest.content
    : payloadFromEntry && Object.prototype.hasOwnProperty.call(payloadFromEntry, 'content')
      ? payloadFromEntry.content
      : undefined;

  return {
    eventType: normalizedEventType,
    ...rest,
    payload: buildPayload({ role, content }),
  } as ChatMessageEntry;
}

export function mapHistoryToOpenAIMessages(history: unknown): OpenAIMessage[] {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const record = entry as JsonLikeObject;
      const payloadValue = record.payload;
      const payload =
        payloadValue && typeof payloadValue === 'object'
          ? (payloadValue as ChatMessagePayload)
          : null;

      const role =
        (payload && typeof payload.role === 'string' ? payload.role : undefined) ??
        (typeof record.role === 'string' ? record.role : null);

      if (!role) {
        return null;
      }

      let content: unknown;
      if (payload && Object.prototype.hasOwnProperty.call(payload, 'content')) {
        content = payload.content;
      } else if (Object.prototype.hasOwnProperty.call(record, 'content')) {
        content = record.content;
      } else {
        content = '';
      }

      return { role, content } satisfies OpenAIMessage;
    })
    .filter((message): message is OpenAIMessage => Boolean(message));
}

export default {
  createChatMessageEntry,
  mapHistoryToOpenAIMessages,
};
