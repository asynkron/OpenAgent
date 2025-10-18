/**
 * Helpers that prepare history entries for the summarization request.
 * Extracted to keep `historyCompactor.ts` focused on orchestration logic.
 */

import { createChatMessageEntry } from './historyEntry.js';
import type { ChatMessageContent, ChatMessageEntry } from '../contracts/index.js';

const stringifyContent = (content: ChatMessageContent | undefined): string => {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (item.type === 'text' && typeof item.text === 'string') {
          return item.text;
        }

        if (item.type === 'text' && typeof item.value === 'string') {
          return item.value;
        }

        return '';
      })
      .filter((chunk) => chunk.length > 0)
      .join('\n');
  }

  return '';
};

const normalizeContent = (entry: ChatMessageEntry): string => {
  const payloadContent =
    Object.prototype.hasOwnProperty.call(entry.payload, 'content') && entry.payload.content
      ? entry.payload.content
      : undefined;

  const chosenContent =
    typeof entry.content !== 'undefined' ? entry.content : (payloadContent as ChatMessageContent);

  return stringifyContent(chosenContent);
};

export const buildSummarizationInput = (entries: ChatMessageEntry[]): ChatMessageEntry[] => {
  const formattedEntries = entries
    .map((entry, index) => {
      const role = typeof entry.role === 'string' ? entry.role : 'unknown';
      const content = normalizeContent(entry);
      const passLabel = Number.isFinite(entry.pass) ? `pass ${entry.pass}` : 'unknown pass';
      return `Entry ${index + 1} (${role}, ${passLabel}):\n${content}`;
    })
    .join('\n\n');

  return [
    createChatMessageEntry({
      eventType: 'chat-message',
      role: 'system',
      content:
        'You summarize prior conversation history into a concise long-term memory for an autonomous agent. Capture key facts, decisions, obligations, and user preferences. Respond with plain text only.',
    }),
    createChatMessageEntry({
      eventType: 'chat-message',
      role: 'user',
      content: `Summarize the following ${entries.length} conversation entries for long-term memory. Preserve critical details while remaining concise.\n\n${formattedEntries}`,
    }),
  ];
};
