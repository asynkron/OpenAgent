const DEFAULT_CONTEXT_WINDOW = 256_000;

const MODEL_CONTEXT_ENTRIES = [
  ['gpt-4.1', 128_000],
  ['gpt-4.1-mini', 128_000],
  ['gpt-4.1-nano', 128_000],
  ['gpt-4o', 128_000],
  ['gpt-4o-mini', 128_000],
  ['gpt-4o-realtime-preview', 128_000],
  ['gpt-4o-realtime-preview-mini', 128_000],
  ['gpt-4o-audio-preview', 128_000],
  ['gpt-4.1-preview', 128_000],
  ['gpt-4o-mini-2024-07-18', 128_000],
  ['o4-mini', 128_000],
  ['gpt-5-codex', 256_000],
] as const satisfies ReadonlyArray<readonly [string, number]>;

const MODEL_CONTEXT_WINDOWS = new Map<string, number>(
  MODEL_CONTEXT_ENTRIES.map(([key, value]) => [key.toLowerCase(), value] as const),
);

function parsePositiveInteger(value: unknown): number | null {
  if (value == null) {
    return null;
  }

  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

export type ContextWindowOptions = {
  model?: string | null;
};

export function getContextWindow({ model }: ContextWindowOptions = {}): number | null {
  const rawOverride = process.env.OPENAI_CONTEXT_WINDOW;
  const envOverride = parsePositiveInteger(rawOverride);
  if (envOverride) {
    return envOverride;
  }

  if (typeof rawOverride === 'string' && rawOverride.trim()) {
    return null;
  }

  if (!model || typeof model !== 'string') {
    return DEFAULT_CONTEXT_WINDOW;
  }

  const normalized = model.toLowerCase();
  const windowSize = MODEL_CONTEXT_WINDOWS.get(normalized);
  if (windowSize) {
    return windowSize;
  }

  return DEFAULT_CONTEXT_WINDOW;
}

type MessageLike = {
  content?: unknown;
} | null;

function flattenContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content.map((item) => flattenContent(item)).join(' ');
  }

  if (content && typeof content === 'object') {
    try {
      return JSON.stringify(content);
    } catch (_error) {
      return '';
    }
  }

  return '';
}

export function estimateTokensForHistory(history?: readonly MessageLike[] | null): number {
  if (!Array.isArray(history) || history.length === 0) {
    return 0;
  }

  let totalChars = 0;
  let messageCount = 0;

  for (const entry of history) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    messageCount += 1;
    totalChars += flattenContent(entry.content).length;
  }

  if (totalChars === 0) {
    return messageCount > 0 ? messageCount * 4 : 0;
  }

  const tokensFromCharacters = Math.ceil(totalChars / 4);
  const structuralTokens = messageCount * 6;

  return tokensFromCharacters + structuralTokens;
}

export type ContextUsageSummary = {
  total: number | null;
  used: number;
  remaining: number | null;
  percentRemaining: number | null;
};

export type SummarizeContextUsageOptions = {
  history?: readonly MessageLike[] | null;
  model?: string | null;
};

export function summarizeContextUsage({
  history,
  model,
}: SummarizeContextUsageOptions = {}): ContextUsageSummary {
  const total = getContextWindow({ model });
  const used = estimateTokensForHistory(history);

  if (!total || total <= 0) {
    return {
      total: null,
      used,
      remaining: null,
      percentRemaining: null,
    };
  }

  const remaining = Math.max(total - used, 0);
  const percentRemaining = total > 0 ? (remaining / total) * 100 : null;

  return {
    total,
    used,
    remaining,
    percentRemaining,
  };
}

export default {
  getContextWindow,
  estimateTokensForHistory,
  summarizeContextUsage,
};
