/**
 * History compaction helper that summarizes older conversation entries when the
 * token usage approaches the model limit.
 *
 * Responsibilities:
 * - Estimate context usage for the active history.
 * - Summarize older entries via the OpenAI Responses API when the usage ratio
 *   exceeds a configurable threshold.
 * - Replace the compacted slice of history with a synthetic summary entry.
 *
 * Note: The runtime still imports the compiled `historyCompactor.js`; run `tsc`
 * to regenerate it after editing this source until the build pipeline emits from
 * TypeScript directly.
 */

import { createChatMessageEntry, mapHistoryToModelMessages } from './historyEntry.js';
import { summarizeContextUsage, type ContextUsageSummary } from '../utils/contextUsage.js';
import { extractResponseText } from '../openai/responseUtils.js';
import { createResponse, type ResponsesClient } from '../openai/responses.js';
import { getOpenAIRequestSettings } from '../openai/client.js';
import type { ChatMessageContent, ChatMessageEntry } from '../contracts/index.js';

const DEFAULT_USAGE_THRESHOLD = 0.5;
const DEFAULT_SUMMARY_PREFIX = 'Compacted memory:';

export interface HistoryCompactorLogger {
  log?(message: string, meta?: HistoryCompactorLogMeta): void;
  warn?(message: string, meta?: HistoryCompactorLogMeta): void;
}

export interface HistoryCompactorLogMeta {
  entriesCompacted?: number;
  originalHistoryLength?: number;
  resultingHistoryLength?: number;
  error?: string;
}

export interface HistoryCompactorOptions {
  openai?: ResponsesClient | null;
  model?: string | null;
  usageThreshold?: number;
  logger?: HistoryCompactorLogger | null;
}

export interface CompactIfNeededInput {
  history?: ChatMessageEntry[] | null;
}

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

const buildSummarizationInput = (entries: ChatMessageEntry[]): ChatMessageEntry[] => {
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

export class HistoryCompactor {
  private readonly openai?: ResponsesClient | null;

  private readonly model?: string | null;

  private readonly usageThreshold: number;

  private readonly logger: HistoryCompactorLogger | null;

  constructor({
    openai,
    model,
    usageThreshold = DEFAULT_USAGE_THRESHOLD,
    logger,
  }: HistoryCompactorOptions = {}) {
    this.openai = openai ?? undefined;
    this.model = model ?? undefined;
    this.usageThreshold = usageThreshold;
    this.logger = logger ?? { log: console.log.bind(console), warn: console.warn.bind(console) };
  }

  async compactIfNeeded({ history }: CompactIfNeededInput): Promise<boolean> {
    if (!Array.isArray(history) || history.length === 0) {
      return false;
    }

    if (!this.hasResponsesClient()) {
      return false;
    }

    const usage = this.summarizeUsage(history);
    if (!usage || usage.total === null || usage.total <= 0) {
      return false;
    }

    const usageRatio = usage.used / usage.total;
    if (usageRatio <= this.usageThreshold) {
      return false;
    }

    const firstContentIndex = history[0]?.role === 'system' ? 1 : 0;
    const availableEntries = history.length - firstContentIndex;
    if (availableEntries <= 1) {
      return false;
    }

    const entriesToCompactCount = Math.max(1, Math.floor(availableEntries / 2));
    const entriesToCompact = history.slice(
      firstContentIndex,
      firstContentIndex + entriesToCompactCount,
    );

    const modelName = typeof this.model === 'string' && this.model.trim() ? this.model : null;
    if (!modelName) {
      return false;
    }

    const responsesClient = this.resolveResponsesClient();

    let summary: string;
    try {
      summary = await this.generateSummary(entriesToCompact, responsesClient, modelName);
    } catch (error) {
      this.warn('[history-compactor] Failed to summarize history entries.', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }

    const summarizedText = summary.trim();
    if (!summarizedText) {
      return false;
    }

    this.log(`[history-compactor] Compacted summary:\n${summarizedText}`);

    const compactedPass = entriesToCompact.reduce<number>((max, entry) => {
      if (typeof entry.pass === 'number' && entry.pass > max) {
        return entry.pass;
      }
      return max;
    }, 0);

    const compactedEntry = createChatMessageEntry({
      eventType: 'chat-message',
      role: 'system',
      content: `${DEFAULT_SUMMARY_PREFIX}\n${summarizedText}`.trim(),
      pass: compactedPass,
    });

    const originalHistoryLength = history.length;
    history.splice(firstContentIndex, entriesToCompactCount, compactedEntry);
    this.log('[history-compactor] Compacted history entries.', {
      entriesCompacted: entriesToCompactCount,
      originalHistoryLength,
      resultingHistoryLength: history.length,
    });

    return true;
  }

  async generateSummary(
    entries: ChatMessageEntry[],
    openai: ResponsesClient,
    model: string,
  ): Promise<string> {
    const input = buildSummarizationInput(entries);
    const { maxRetries } = getOpenAIRequestSettings();

    const response = await createResponse({
      openai,
      model,
      input: mapHistoryToModelMessages(input),
      tools: undefined,
      options: typeof maxRetries === 'number' ? { maxRetries } : undefined,
      reasoningEffort: undefined,
    });

    return extractResponseText(response).trim();
  }

  private hasResponsesClient(): boolean {
    if (!this.openai) {
      return false;
    }

    if (typeof (this.openai as ResponsesClient).responses === 'function') {
      return true;
    }

    return typeof this.openai === 'function';
  }

  private resolveResponsesClient(): ResponsesClient {
    if (!this.openai) {
      throw new Error('Responses client is not configured.');
    }

    return this.openai;
  }

  private summarizeUsage(history: ChatMessageEntry[]): ContextUsageSummary | null {
    try {
      return summarizeContextUsage({ history, model: this.model ?? undefined });
    } catch (error) {
      this.warn('[history-compactor] Failed to evaluate context usage.', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private log(message: string, meta?: HistoryCompactorLogMeta): void {
    if (this.logger?.log) {
      if (meta) {
        this.logger.log(message, meta);
      } else {
        this.logger.log(message);
      }
    }
  }

  private warn(message: string, meta?: HistoryCompactorLogMeta): void {
    if (this.logger?.warn) {
      if (meta) {
        this.logger.warn(message, meta);
      } else {
        this.logger.warn(message);
      }
    }
  }
}

export default HistoryCompactor;
