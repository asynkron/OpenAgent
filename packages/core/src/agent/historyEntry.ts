/**
 * Conversation history helpers shared across the agent runtime.
 *
 * Responsibilities:
 * - Normalize chat history entries into a consistent payload structure.
 * - Project the normalized history into the AI SDK message shape expected by
 *   the configured language model provider.
 *
 * Note: The runtime still imports the compiled `historyEntry.js`; run `tsc` to
 * regenerate it after editing this source until the build pipeline emits from
 * TypeScript directly.
 */

import type { ModelMessage } from 'ai';
import type {
  ChatMessageContent,
  ChatMessageEntry as ChatMessageContract,
  ChatMessagePayload,
} from '../contracts/index.js';

const DEFAULT_EVENT_TYPE = 'chat-message';
const MODEL_ROLES = ['system', 'user', 'assistant'] as const;
type ModelRole = (typeof MODEL_ROLES)[number];

export type ChatMessageEntry = ChatMessageContract;
export type ModelChatMessage = ModelMessage;

export interface ChatMessageEntryInput {
  eventType?: string;
  payload?: ChatMessagePayload;
  role?: string;
  content?: ChatMessageContent;
  pass?: number;
  summary?: string;
  details?: string;
  id?: string;
  name?: string;
}

const buildPayload = (
  role: string | undefined,
  content: ChatMessageContent | undefined,
  providedPayload?: ChatMessagePayload,
): ChatMessagePayload => {
  const payload: ChatMessagePayload = {};

  if (providedPayload) {
    if (typeof providedPayload.role === 'string') {
      payload.role = providedPayload.role;
    }

    if (Object.prototype.hasOwnProperty.call(providedPayload, 'content')) {
      payload.content = providedPayload.content;
    }

    if (Object.prototype.hasOwnProperty.call(providedPayload, 'observation')) {
      payload.observation = providedPayload.observation ?? null;
    }
  }

  if (typeof role === 'string') {
    payload.role = role;
  }

  if (typeof content !== 'undefined') {
    payload.content = content;
  }

  return payload;
};

const isModelRole = (value: string | undefined): value is ModelRole => {
  if (typeof value !== 'string') {
    return false;
  }

  return MODEL_ROLES.includes(value.trim().toLowerCase() as ModelRole);
};

const resolveRole = (
  rootRole: string | undefined,
  payloadRole: string | undefined,
): ModelRole | undefined => {
  if (isModelRole(rootRole)) {
    return rootRole;
  }

  if (isModelRole(payloadRole)) {
    return payloadRole;
  }

  return undefined;
};

const resolveInitialContent = (
  hasRootContent: boolean,
  rootContent: ChatMessageContent | undefined,
  payload: ChatMessagePayload,
): ChatMessageContent | undefined => {
  if (hasRootContent) {
    return rootContent;
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'content')) {
    return payload.content;
  }

  return undefined;
};

const definePropertyAccessors = (message: ChatMessageEntry): void => {
  Object.defineProperty(message, 'role', {
    enumerable: false,
    configurable: true,
    get() {
      return typeof message.payload.role === 'string' ? message.payload.role : undefined;
    },
    set(value: string | undefined) {
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
    set(value: ChatMessageContent | undefined) {
      if (typeof value === 'undefined') {
        delete message.payload.content;
      } else {
        message.payload.content = value;
      }
    },
  });
};

export const createChatMessageEntry = (
  entry: ChatMessageEntryInput = {},
): ChatMessageEntry => {
  const {
    eventType,
    payload: providedPayload,
    role: rootRole,
    content: rootContent,
    pass,
    summary,
    details,
    id,
    name,
  } = entry;

  const normalizedEventType =
    typeof eventType === 'string' && eventType.trim() ? eventType : DEFAULT_EVENT_TYPE;

  const payload = buildPayload(
    typeof rootRole === 'string' ? rootRole : undefined,
    rootContent,
    providedPayload,
  );

  const hasRootContent = Object.prototype.hasOwnProperty.call(entry, 'content');
  const resolvedRole = resolveRole(rootRole, payload.role);
  const resolvedContent = resolveInitialContent(hasRootContent, rootContent, payload);

  const message: ChatMessageEntry = {
    eventType: normalizedEventType,
    payload,
  };

  if (typeof pass === 'number' && Number.isFinite(pass)) {
    message.pass = pass;
  }

  if (typeof summary === 'string') {
    message.summary = summary;
  }

  if (typeof details === 'string') {
    message.details = details;
  }

  if (typeof id === 'string') {
    message.id = id;
  }

  if (typeof name === 'string') {
    message.name = name;
  }

  if (typeof resolvedRole === 'string') {
    message.payload.role = resolvedRole;
  }

  if (typeof resolvedContent !== 'undefined') {
    message.payload.content = resolvedContent;
  }

  definePropertyAccessors(message);
  return message;
};

const normalizeContentForModel = (content: ChatMessageContent | undefined): string => {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    const combined = content
      .map((item) => {
        if (item.type === 'text') {
          if (typeof item.text === 'string' && item.text.trim()) {
            return item.text;
          }

          if (typeof item.value === 'string' && item.value.trim()) {
            return item.value;
          }
        }

        return '';
      })
      .filter((chunk) => chunk.length > 0)
      .join('\n');

    if (combined.trim()) {
      return combined;
    }
  }

  return '';
};

export const mapHistoryToModelMessages = (
  history: readonly ChatMessageEntry[] | null | undefined,
): ModelChatMessage[] => {
  if (!Array.isArray(history)) {
    return [];
  }

  const messages: ModelChatMessage[] = [];

  for (const entry of history) {
    if (!entry) {
      continue;
    }

    const payload = entry.payload ?? {};
    const role = resolveRole(entry.role, payload.role);

    if (!role) {
      continue;
    }

    const contentValue =
      typeof entry.content !== 'undefined'
        ? entry.content
        : Object.prototype.hasOwnProperty.call(payload, 'content')
          ? payload.content
          : undefined;

    const normalizedContent = normalizeContentForModel(contentValue);

    if (role === 'system') {
      const message: ModelMessage = { role: 'system', content: normalizedContent };
      messages.push(message);
      continue;
    }

    if (role === 'user') {
      const message: ModelMessage = { role: 'user', content: normalizedContent };
      messages.push(message);
      continue;
    }

    if (role === 'assistant') {
      const message: ModelMessage = { role: 'assistant', content: normalizedContent };
      messages.push(message);
    }
  }

  return messages;
};

export default {
  createChatMessageEntry,
  mapHistoryToModelMessages,
};
