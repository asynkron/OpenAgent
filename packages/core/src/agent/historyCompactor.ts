// @ts-nocheck
/**
 * History compaction helper that summarizes old conversation entries when usage spikes.
 *
 * Responsibilities:
 * - Estimate token usage for the active history and decide when compaction is needed.
 * - Invoke the OpenAI Responses API to summarize older entries into a long-term memory note.
 * - Replace the compacted slice of history with a synthetic summary entry.
 *
 * Note: The runtime still imports the compiled `historyCompactor.js`; run `tsc` to
 * regenerate it after editing this source until the build pipeline emits from
 * TypeScript directly.
 */
import { summarizeContextUsage } from '../utils/contextUsage.js';
import { extractResponseText } from '../openai/responseUtils.js';
import { createResponse } from '../openai/responses.js';
import { getOpenAIRequestSettings } from '../openai/client.js';
import { createChatMessageEntry, mapHistoryToModelMessages } from './historyEntry.js';
import type { ChatMessageEntry } from './historyEntry.js';

const DEFAULT_USAGE_THRESHOLD = 0.5;
const DEFAULT_SUMMARY_PREFIX = 'Compacted memory:';

export type JsonLike = Record<string, unknown>;

export interface ChatHistoryEntry extends JsonLike {
  role?: string | null;
  content?: unknown;
  pass?: number;
}

export interface HistoryCompactorOptions {
  openai?: OpenAIClient | null;
  model?: string | null;
  usageThreshold?: number;
  logger?: Logger;
}

export interface CompactIfNeededInput {
  history?: ChatHistoryEntry[] | null;
}

export interface OpenAIClient {
  responses?: ((model: string | null | undefined) => unknown) | null;
}

export type Logger = {
  [key: string]: ((...args: unknown[]) => void) | undefined;
};

const stringifyContent = (content: unknown): string => {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => stringifyContent(item))
      .filter((chunk) => chunk.length > 0)
      .join('\n');
  }

  if (content && typeof content === 'object') {
    try {
      return JSON.stringify(content, null, 2);
    } catch (_error) {
      return '';
    }
  }

  if (content === null || content === undefined) {
    return '';
  }

  return String(content);
};

const buildSummarizationInput = (entries: ChatHistoryEntry[]): ChatMessageEntry[] => {
  const formattedEntries = entries
    .map((entry, index) => {
      const role = typeof entry?.role === 'string' ? entry.role : 'unknown';
      const content = stringifyContent(entry?.content);
      const passLabel = typeof entry?.pass === 'number' ? `pass ${entry.pass}` : 'unknown pass';
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
  private readonly openai?: OpenAIClient | null;

  private readonly model?: string | null;

  private readonly usageThreshold: number;

  private readonly logger: Logger;

  constructor({
    openai,
    model,
    usageThreshold = DEFAULT_USAGE_THRESHOLD,
    logger,
  }: HistoryCompactorOptions = {}) {
    this.openai = openai ?? undefined;
    this.model = model ?? undefined;
    this.usageThreshold = usageThreshold;
    const defaultLogger = console as unknown as Logger;
    this.logger = logger ?? defaultLogger;
  }

  async compactIfNeeded({ history }: CompactIfNeededInput): Promise<boolean> {
    if (!Array.isArray(history) || history.length === 0) {
      return false;
    }

    const hasResponsesApi = Boolean(this.openai && typeof this.openai.responses === 'function');

    if (!hasResponsesApi) {
      return false;
    }

    const usage = summarizeContextUsage({ history, model: this.model ?? undefined });
    if (
      !usage ||
      typeof usage.used !== 'number' ||
      typeof usage.total !== 'number' ||
      usage.total <= 0
    ) {
      return false;
    }

    const usageRatio = usage.used / usage.total;
    if (!(usageRatio > this.usageThreshold)) {
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

    let summary: string;
    try {
      summary = await this.generateSummary(entriesToCompact);
    } catch (error) {
      this._log('warn', '[history-compactor] Failed to summarize history entries.', error);
      return false;
    }

    if (!summary) {
      return false;
    }

    const summarizedText = summary.trim();
    if (!summarizedText) {
      return false;
    }

    this._log('log', `[history-compactor] Compacted summary:\n${summarizedText}`);

    const compactedPass = entriesToCompact.reduce<number>((max, entry) => {
      if (typeof entry?.pass === 'number' && entry.pass > max) {
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
    this._log('log', '[history-compactor] Compacted history entries.', {
      entriesCompacted: entriesToCompactCount,
      originalHistoryLength,
      resultingHistoryLength: history.length,
    });

    return true;
  }

  async generateSummary(entries: ChatHistoryEntry[]): Promise<string> {
    const input = buildSummarizationInput(entries);
    const { maxRetries } = getOpenAIRequestSettings();
    const response = await createResponse({
      openai: this.openai,
      model: this.model ?? undefined,
      input: mapHistoryToModelMessages(input),
      tools: undefined,
      options:
        typeof maxRetries === 'number'
          ? {
              maxRetries,
            }
          : undefined,
      reasoningEffort: undefined,
    });

    const summary = extractResponseText(response);
    return summary.trim();
  }

  private _log(method: 'log' | 'warn', message: string, meta?: unknown): void {
    const fn =
      this.logger && typeof this.logger[method] === 'function' ? this.logger[method] : null;
    if (!fn) {
      return;
    }

    if (meta === undefined) {
      fn(message);
      return;
    }

    fn(message, meta);
  }
}

export default HistoryCompactor;
