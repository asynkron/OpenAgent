import { summarizeContextUsage } from '../utils/contextUsage.js';
import { extractResponseText } from '../openai/responseUtils.js';
import { createResponse } from '../openai/responses.js';

const DEFAULT_USAGE_THRESHOLD = 0.5;
const DEFAULT_SUMMARY_PREFIX = 'Compacted memory:';

function stringifyContent(content) {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => stringifyContent(item))
      .filter(Boolean)
      .join('\n');
  }

  if (content && typeof content === 'object') {
    try {
      return JSON.stringify(content, null, 2);
    } catch (error) {
      return '';
    }
  }

  if (content === null || content === undefined) {
    return '';
  }

  return String(content);
}

function buildSummarizationInput(entries) {
  const formattedEntries = entries
    .map((entry, index) => {
      const role = entry?.role ?? 'unknown';
      const content = stringifyContent(entry?.content);
      return `Entry ${index + 1} (${role}):\n${content}`;
    })
    .join('\n\n');

  return [
    {
      role: 'system',
      content:
        'You summarize prior conversation history into a concise long-term memory for an autonomous agent. Capture key facts, decisions, obligations, and user preferences. Respond with plain text only.',
    },
    {
      role: 'user',
      content: `Summarize the following ${entries.length} conversation entries for long-term memory. Preserve critical details while remaining concise.\n\n${formattedEntries}`,
    },
  ];
}

export class HistoryCompactor {
  constructor({ openai, model, usageThreshold = DEFAULT_USAGE_THRESHOLD, logger = console } = {}) {
    this.openai = openai;
    this.model = model;
    this.usageThreshold = usageThreshold;
    this.logger = logger ?? console;
  }

  async compactIfNeeded({ history }) {
    if (!Array.isArray(history) || history.length === 0) {
      return false;
    }

    if (
      !this.openai ||
      !this.openai.responses ||
      typeof this.openai.responses.create !== 'function'
    ) {
      return false;
    }

    const usage = summarizeContextUsage({ history, model: this.model });
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

    let summary;
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

    this._log('log', `[history-compactor] Compacted summary:\n${summarizedText}`);

    const compactedEntry = {
      role: 'system',
      content: `${DEFAULT_SUMMARY_PREFIX}\n${summarizedText}`.trim(),
    };

    const originalHistoryLength = history.length;
    history.splice(firstContentIndex, entriesToCompactCount, compactedEntry);
    // Log the before/after lengths explicitly so the compaction impact is clear.
    this._log('log', '[history-compactor] Compacted history entries.', {
      entriesCompacted: entriesToCompactCount,
      originalHistoryLength,
      resultingHistoryLength: history.length,
    });

    return true;
  }

  async generateSummary(entries) {
    const input = buildSummarizationInput(entries);
    const response = await createResponse({
      openai: this.openai,
      model: this.model,
      input,
    });

    const summary = extractResponseText(response);
    return summary.trim();
  }

  _log(method, message, meta) {
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
