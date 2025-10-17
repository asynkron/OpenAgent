/**
 * Conversation history pruning helpers.
 *
 * Responsibilities:
 * - Apply configurable rules that redact or remove stale history entries.
 * - Enforce an optional "dementia" policy that drops entries older than a pass threshold.
 *
 * Note: The runtime still imports the compiled `amnesiaManager.js`; run `tsc`
 * to regenerate it after editing this source until the build pipeline emits from
 * TypeScript directly.
 */

import { createChatMessageEntry, type ChatMessageEntry } from './historyEntry.js';
import type { PlanObservationMetadata, PlanStep } from '../../../../contracts/index.js';

const JSON_INDENT = 2 as const;
const DEFAULT_THRESHOLD = 10 as const;

export type ChatHistoryEntry = ChatMessageEntry;

export interface ParsedContent {
  type?: string;
  message?: string;
  summary?: string;
  details?: string;
  auto_response?: string;
  plan?: PlanStep[];
  metadata?: PlanObservationMetadata | null;
}

export interface AmnesiaRuleContext {
  entry: ChatHistoryEntry;
  readContent: () => ParsedContent | null;
  removeEntry: () => void;
  rewriteContent: (nextContent: ParsedContent) => void;
}

export type AmnesiaRule = (context: AmnesiaRuleContext) => void;

export interface AmnesiaManagerOptions {
  threshold?: number;
  rules?: AmnesiaRule[];
}

interface ApplyOptions {
  history: ChatHistoryEntry[];
  currentPass: number;
}

const extractPlanStepArray = (value: unknown): PlanStep[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value as PlanStep[];
};

const extractMetadata = (value: unknown): PlanObservationMetadata | null | undefined => {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  return value as PlanObservationMetadata;
};

const safeParse = (value: string | undefined): ParsedContent | null => {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    const candidate = parsed as {
      type?: unknown;
      message?: unknown;
      summary?: unknown;
      details?: unknown;
      auto_response?: unknown;
      plan?: unknown;
      metadata?: unknown;
    };

    const content: ParsedContent = {};

    if (typeof candidate.type === 'string') {
      content.type = candidate.type;
    }

    if (typeof candidate.message === 'string') {
      content.message = candidate.message;
    }

    if (typeof candidate.summary === 'string') {
      content.summary = candidate.summary;
    }

    if (typeof candidate.details === 'string') {
      content.details = candidate.details;
    }

    if (typeof candidate.auto_response === 'string') {
      content.auto_response = candidate.auto_response;
    }

    const planSteps = extractPlanStepArray(candidate.plan);
    if (planSteps) {
      content.plan = planSteps;
    }

    const metadata = extractMetadata(candidate.metadata);
    if (metadata) {
      content.metadata = metadata;
    }

    return content;
  } catch (_error) {
    return null;
  }
};

const stringifyParsedContent = (content: ParsedContent, fallback: string | undefined): string | undefined => {
  const payload: {
    type?: string;
    message?: string;
    summary?: string;
    details?: string;
    auto_response?: string;
    plan?: PlanStep[];
    metadata?: PlanObservationMetadata | null;
  } = {};

  if (content.type) {
    payload.type = content.type;
  }

  if (content.message) {
    payload.message = content.message;
  }

  if (content.summary) {
    payload.summary = content.summary;
  }

  if (content.details) {
    payload.details = content.details;
  }

  if (content.auto_response) {
    payload.auto_response = content.auto_response;
  }

  if (content.plan && content.plan.length > 0) {
    payload.plan = content.plan;
  }

  if (content.metadata) {
    payload.metadata = content.metadata;
  }

  try {
    return JSON.stringify(payload, null, JSON_INDENT);
  } catch (_error) {
    return fallback;
  }
};

const normalizeThreshold = (threshold: number | null | undefined, defaultValue: number): number => {
  if (typeof threshold !== 'number' || !Number.isFinite(threshold)) {
    return defaultValue;
  }

  if (threshold <= 0) {
    return 0;
  }

  return Math.floor(threshold);
};

const DEFAULT_RULES: AmnesiaRule[] = [
  ({ readContent, removeEntry }) => {
    const content = readContent();
    if (content?.type === 'plan-update') {
      removeEntry();
    }
  },
  ({ readContent, rewriteContent }) => {
    const content = readContent();
    if (!content || !content.plan || content.plan.length === 0) {
      return;
    }

    const updated: ParsedContent = {
      type: content.type,
      message: content.message,
      summary: content.summary,
      details: content.details,
      auto_response: content.auto_response,
      metadata: content.metadata ?? null,
    };

    rewriteContent(updated);
  },
];

export class AmnesiaManager {
  readonly threshold: number;
  readonly rules: AmnesiaRule[];

  constructor({ threshold = DEFAULT_THRESHOLD, rules = DEFAULT_RULES }: AmnesiaManagerOptions = {}) {
    this.threshold = normalizeThreshold(threshold ?? null, DEFAULT_THRESHOLD);
    this.rules = Array.isArray(rules) && rules.length > 0 ? rules.slice() : DEFAULT_RULES;
  }

  apply({ history, currentPass }: ApplyOptions): boolean {
    if (!Array.isArray(history) || history.length === 0) {
      return false;
    }

    if (!Number.isFinite(currentPass)) {
      return false;
    }

    if (this.threshold === 0) {
      return false;
    }

    const cutoffPass = currentPass - this.threshold;
    if (!Number.isFinite(cutoffPass)) {
      return false;
    }

    let mutated = false;

    for (let index = history.length - 1; index >= 0; index -= 1) {
      const entry = history[index];
      if (!entry) {
        continue;
      }

      if (entry.role === 'system') {
        continue;
      }

      if (typeof entry.pass !== 'number' || entry.pass >= cutoffPass) {
        continue;
      }

      let cachedContent: ParsedContent | null = null;
      let parsed = false;
      let shouldRemove = false;
      let shouldRewrite = false;

      const ensureParsed = () => {
        if (!parsed) {
          cachedContent = safeParse(typeof entry.content === 'string' ? entry.content : undefined);
          parsed = true;
        }
        return cachedContent;
      };

      const context: AmnesiaRuleContext = {
        entry,
        readContent: () => ensureParsed(),
        removeEntry: () => {
          shouldRemove = true;
        },
        rewriteContent: (nextContent) => {
          cachedContent = nextContent;
          shouldRewrite = true;
        },
      };

      for (const rule of this.rules) {
        if (shouldRemove) {
          break;
        }

        try {
          rule(context);
        } catch (_error) {
          // Ignore rule failures so other rules can continue.
        }
      }

      if (shouldRemove) {
        history.splice(index, 1);
        mutated = true;
        continue;
      }

      if (shouldRewrite && cachedContent) {
        const serialized = stringifyParsedContent(
          cachedContent,
          typeof entry.content === 'string' ? entry.content : undefined,
        );

        if (typeof serialized === 'string') {
          history[index] = createChatMessageEntry({
            ...entry,
            content: serialized,
            payload: {
              ...entry.payload,
              content: serialized,
            },
          });
          mutated = true;
        }
      }
    }

    return mutated;
  }
}

export interface DementiaPolicyOptions {
  history: ChatHistoryEntry[];
  currentPass: number;
  limit: number;
  preserveSystemMessages?: boolean;
}

export const applyDementiaPolicy = ({
  history,
  currentPass,
  limit,
  preserveSystemMessages = true,
}: DementiaPolicyOptions): boolean => {
  if (!Array.isArray(history) || history.length === 0) {
    return false;
  }

  if (!Number.isFinite(limit) || limit <= 0) {
    return false;
  }

  const cutoffPass = currentPass - limit;
  if (!Number.isFinite(cutoffPass)) {
    return false;
  }

  let mutated = false;

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index];
    if (!entry) {
      continue;
    }

    if (preserveSystemMessages && entry.role === 'system') {
      continue;
    }

    if (typeof entry.pass !== 'number') {
      continue;
    }

    if (entry.pass < cutoffPass) {
      history.splice(index, 1);
      mutated = true;
    }
  }

  return mutated;
};

export default AmnesiaManager;
