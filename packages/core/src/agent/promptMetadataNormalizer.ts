import type {
  PromptMetadataEntry,
  PromptRequestMetadata,
  PromptRequestScope,
} from '../prompts/types.js';

const DEFAULT_METADATA: PromptRequestMetadata = {
  scope: 'user-input',
  promptId: null,
  description: null,
  tags: [],
  extra: [],
};

export function normalizePromptMetadata(
  metadata: PromptRequestMetadata | null | undefined,
): PromptRequestMetadata {
  if (!metadata) {
    return cloneDefaultMetadata();
  }

  const scope = normalizeScope(metadata.scope);
  const promptId = typeof metadata.promptId === 'string' ? metadata.promptId : null;
  const description = typeof metadata.description === 'string' ? metadata.description : null;
  const tags = Array.isArray(metadata.tags)
    ? metadata.tags.filter((tag): tag is string => typeof tag === 'string')
    : [];
  const extra = normalizeExtra(metadata.extra);

  return { scope, promptId, description, tags, extra };
}

function cloneDefaultMetadata(): PromptRequestMetadata {
  return {
    scope: DEFAULT_METADATA.scope,
    promptId: DEFAULT_METADATA.promptId,
    description: DEFAULT_METADATA.description,
    tags: DEFAULT_METADATA.tags ? [...DEFAULT_METADATA.tags] : [],
    extra: DEFAULT_METADATA.extra ? [...DEFAULT_METADATA.extra] : [],
  };
}

function normalizeScope(candidate: unknown): PromptRequestScope {
  if (typeof candidate === 'string') {
    const trimmed = candidate.trim();
    if (trimmed.length > 0) {
      return trimmed as PromptRequestScope;
    }
  }
  return 'user-input';
}

function normalizeExtra(entries: unknown): PromptMetadataEntry[] {
  if (!Array.isArray(entries)) {
    return [];
  }

  const normalized: PromptMetadataEntry[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const candidate = entry as { key?: unknown; value?: unknown };
    const key = normalizeMetadataKey(candidate.key);
    if (key.length === 0) {
      continue;
    }

    const value = normalizeMetadataValue(candidate.value);
    normalized.push({ key, value });
  }

  return normalized;
}

function normalizeMetadataKey(candidate: unknown): string {
  if (typeof candidate === 'string') {
    return candidate;
  }

  if (typeof candidate === 'number' || typeof candidate === 'boolean') {
    return String(candidate);
  }

  return '';
}

function normalizeMetadataValue(candidate: unknown): PromptMetadataEntry['value'] {
  if (typeof candidate === 'string' || typeof candidate === 'number' || typeof candidate === 'boolean') {
    return candidate;
  }

  return null;
}
