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
import { buildSummarizationInput } from './historyCompactorFormatting.js';
import { summarizeContextUsage, type ContextUsageSummary } from '../utils/contextUsage.js';
import { extractResponseText } from '../openai/responseUtils.js';
import { createResponse, type ResponsesClient } from '../openai/responses.js';
import { getOpenAIRequestSettings } from '../openai/client.js';
import type { ChatMessageEntry } from '../contracts/index.js';

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

interface HistoryCompactionPlan {
  firstContentIndex: number;
  entriesToCompactCount: number;
  entriesToCompact: ChatMessageEntry[];
  modelName: string;
  responsesClient: ResponsesClient;
}

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

    const plan = this.buildCompactionPlan(history);
    if (!plan) {
      return false;
    }

    const summarizedText = await this.generateSummarySafely(plan);
    if (!summarizedText) {
      return false;
    }

    this.applyCompaction(history, plan, summarizedText);
    return true;
  }

  private buildCompactionPlan(history: ChatMessageEntry[]): HistoryCompactionPlan | null {
    if (!this.hasResponsesClient()) {
      return null;
    }

    const usage = this.summarizeUsage(history);
    if (!usage || usage.total === null || usage.total <= 0) {
      return null;
    }

    const usageRatio = usage.used / usage.total;
    if (usageRatio <= this.usageThreshold) {
      return null;
    }

    const firstContentIndex = history[0]?.role === 'system' ? 1 : 0;
    const availableEntries = history.length - firstContentIndex;
    if (availableEntries <= 1) {
      return null;
    }

    const entriesToCompactCount = Math.max(1, Math.floor(availableEntries / 2));
    const entriesToCompact = history.slice(
      firstContentIndex,
      firstContentIndex + entriesToCompactCount,
    );

    const modelName = typeof this.model === 'string' && this.model.trim() ? this.model : null;
    if (!modelName) {
      return null;
    }

    const responsesClient = this.resolveResponsesClient();
    return {
      firstContentIndex,
      entriesToCompactCount,
      entriesToCompact,
      modelName,
      responsesClient,
    };
  }

  private async generateSummarySafely(plan: HistoryCompactionPlan): Promise<string | null> {
    try {
      const summary = await this.generateSummary(
        plan.entriesToCompact,
        plan.responsesClient,
        plan.modelName,
      );
      const trimmed = summary.trim();
      if (!trimmed) {
        return null;
      }

      this.log(`[history-compactor] Compacted summary:\n${trimmed}`);
      return trimmed;
    } catch (error) {
      this.warn('[history-compactor] Failed to summarize history entries.', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private applyCompaction(
    history: ChatMessageEntry[],
    plan: HistoryCompactionPlan,
    summary: string,
  ): void {
    const compactedEntry = this.buildCompactedEntry(plan.entriesToCompact, summary);
    const originalHistoryLength = history.length;
    history.splice(plan.firstContentIndex, plan.entriesToCompactCount, compactedEntry);
    this.log('[history-compactor] Compacted history entries.', {
      entriesCompacted: plan.entriesToCompactCount,
      originalHistoryLength,
      resultingHistoryLength: history.length,
    });
  }

  private buildCompactedEntry(
    entriesToCompact: ChatMessageEntry[],
    summary: string,
  ): ChatMessageEntry {
    const compactedPass = this.findHighestPass(entriesToCompact);
    return createChatMessageEntry({
      eventType: 'chat-message',
      role: 'system',
      content: `${DEFAULT_SUMMARY_PREFIX}\n${summary}`.trim(),
      pass: compactedPass,
    });
  }

  private findHighestPass(entries: ChatMessageEntry[]): number {
    return entries.reduce<number>((max, entry) => {
      if (typeof entry.pass === 'number' && entry.pass > max) {
        return entry.pass;
      }
      return max;
    }, 0);
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
