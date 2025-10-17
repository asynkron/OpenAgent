/**
 * Conversation history helpers shared across the agent runtime.
 *
 * Responsibilities:
 * - Normalize chat history entries into a consistent payload structure.
 * - Project the normalized history into the AI SDK message shape expected by
 *   the configured language model provider.
 *
 * Consumers:
 * - History compaction, pass execution, and model request builders.
 *
 * Note: The runtime still imports the compiled `historyEntry.js`; run `tsc` to
 * regenerate it after editing this source until the build pipeline emits from
 * TypeScript directly.
 */

import type { ModelMessage } from 'ai';

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

export type ModelChatMessage = ModelMessage;

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

  const {
    eventType,
    payload: providedPayload,
    role: rootRole,
    content: rootContent,
    ...rest
  } = entry;
  const normalizedEventType =
    typeof eventType === 'string' && eventType.trim() ? eventType : DEFAULT_EVENT_TYPE;

  const payloadFromEntry =
    providedPayload && typeof providedPayload === 'object'
      ? (providedPayload as ChatMessagePayload)
      : undefined;

  const role =
    (typeof rootRole === 'string' ? rootRole : undefined) ??
    (payloadFromEntry && typeof payloadFromEntry.role === 'string'
      ? payloadFromEntry.role
      : undefined);

  const hasContent = Object.prototype.hasOwnProperty.call(entry, 'content');
  const content = hasContent
    ? rootContent
    : payloadFromEntry && Object.prototype.hasOwnProperty.call(payloadFromEntry, 'content')
      ? payloadFromEntry.content
      : undefined;

  const message: ChatMessageEntry = {
    eventType: normalizedEventType,
    ...rest,
    payload: buildPayload({ role, content }),
  };

  Object.defineProperty(message, 'role', {
    enumerable: false,
    configurable: true,
    get() {
      return typeof message.payload.role === 'string' ? message.payload.role : undefined;
    },
    set(value) {
      if (typeof value === 'string') {
        message.payload.role = value;
      } else {
        delete message.payload.role;
      }
    },
  });

  Object.defineProperty(message, 'content', {
    enumerable: false,
    configurable: true,
    get() {
      return Object.prototype.hasOwnProperty.call(message.payload, 'content')
        ? message.payload.content
        : undefined;
    },
    set(value) {
      if (typeof value === 'undefined') {
        delete message.payload.content;
      } else {
        message.payload.content = value;
      }
    },
  });

  return message;
}

export function mapHistoryToModelMessages(history: unknown): ModelChatMessage[] {
  if (!Array.isArray(history)) {
    return [];
  }

  const allowedRoles = new Set<ModelChatMessage['role']>(['system', 'user', 'assistant', 'tool']);

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

      const candidateRole =
        typeof payload?.role === 'string'
          ? payload.role
          : typeof record.role === 'string'
            ? record.role
            : null;

      if (!candidateRole || !allowedRoles.has(candidateRole as ModelChatMessage['role'])) {
        return null;
      }

      let contentValue: unknown;
      if (payload && Object.prototype.hasOwnProperty.call(payload, 'content')) {
        contentValue = payload.content;
      } else if (typeof record.content !== 'undefined') {
        contentValue = record.content;
      } else {
        contentValue = '';
      }

      const normalizedContent = (() => {
        if (typeof contentValue === 'string') {
          return contentValue;
        }

        if (Array.isArray(contentValue)) {
          return contentValue as ModelChatMessage['content'];
        }

        if (contentValue && typeof contentValue === 'object') {
          try {
            return JSON.stringify(contentValue, null, 2);
          } catch (_error) {
            return String(contentValue);
          }
        }

        if (contentValue == null) {
          return '';
        }

        return String(contentValue);
      })();

      return {
        role: candidateRole as ModelChatMessage['role'],
        content: normalizedContent,
      } as ModelChatMessage;
    })
    .filter((message): message is ModelChatMessage => Boolean(message));
}

export default {
  createChatMessageEntry,
  mapHistoryToModelMessages,
};
