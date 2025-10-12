/**
 * Conversation history pruning helpers.
 *
 * Responsibilities:
 * - Apply configurable rules that redact or remove stale history entries.
 * - Enforce an optional "dementia" policy that drops entries older than a pass threshold.
 *
 * Consumers:
 * - Agent loop prior to sending history to the model.
 * - Tests that validate the redaction policy behavior.
 *
 * Note: The runtime still imports the compiled `amnesiaManager.js`; run `tsc`
 * to regenerate it after editing this source until the build pipeline emits from
 * TypeScript directly.
 */
import { createChatMessageEntry, type ChatMessageEntry } from './historyEntry.js';

const JSON_INDENT = 2 as const;
const DEFAULT_THRESHOLD = 10 as const;

export interface ChatHistoryEntry extends ChatMessageEntry {
  pass?: number;
  role?: string;
  content?: string;
}

export interface AmnesiaRuleContext {
  entry: ChatHistoryEntry;
  readContent: () => unknown;
  removeEntry: () => void;
  rewriteContent: (nextContent: unknown) => void;
}

export type AmnesiaRule = (context: AmnesiaRuleContext) => void;

export interface AmnesiaManagerOptions {
  threshold?: number;
  rules?: AmnesiaRule[];
}

interface ParseResult {
  parsed: boolean;
  value: unknown;
}

const DEFAULT_RULES: AmnesiaRule[] = [
  // Drop bulky plan update entries once they are older than the configured threshold.
  ({ readContent, removeEntry }) => {
    const content = readContent();
    if (!content || typeof content !== 'object') {
      return;
    }

    if ((content as Record<string, unknown>).type === 'plan-update') {
      removeEntry();
    }
  },
  // As a fallback, strip any stray plan payloads from assistant messages that survived other rules.
  ({ readContent, rewriteContent }) => {
    const content = readContent();
    if (!content || typeof content !== 'object') {
      return;
    }

    if (!Object.prototype.hasOwnProperty.call(content, 'plan')) {
      return;
    }

    const updated = { ...(content as Record<string, unknown>) };
    delete (updated as Record<string, unknown>).plan;
    rewriteContent(updated);
  },
];

function safeParse(value: unknown): ParseResult {
  if (typeof value !== 'string') {
    return { parsed: false, value: null };
  }

  try {
    return { parsed: true, value: JSON.parse(value) };
  } catch (error) {
    return { parsed: false, value: null };
  }
}

function stringifyContent(value: unknown, fallback: string | undefined): string | undefined {
  if (typeof value === 'undefined') {
    return fallback;
  }

  try {
    return JSON.stringify(value, null, JSON_INDENT);
  } catch (error) {
    return fallback;
  }
}

function normalizeThreshold(threshold: unknown, defaultValue: number): number {
  if (typeof threshold !== 'number') {
    return defaultValue;
  }

  const finite = Number.isFinite(threshold) ? threshold : defaultValue;
  if (finite <= 0) {
    return 0;
  }

  return Math.floor(finite);
}

export interface ApplyOptions {
  history: ChatHistoryEntry[];
  currentPass: number;
}

export class AmnesiaManager {
  readonly threshold: number;
  readonly rules: AmnesiaRule[];

  constructor({ threshold = DEFAULT_THRESHOLD, rules = DEFAULT_RULES }: AmnesiaManagerOptions = {}) {
    this.threshold = normalizeThreshold(threshold, DEFAULT_THRESHOLD);
    this.rules = Array.isArray(rules) && rules.length > 0 ? rules.slice() : DEFAULT_RULES;
  }

  apply({ history, currentPass }: ApplyOptions): boolean {
    if (!Array.isArray(history) || history.length === 0) {
      return false;
    }

    if (!Number.isFinite(currentPass)) {
      return false;
    }

    if (!this.threshold) {
      return false;
    }

    const cutoffPass = currentPass - this.threshold;
    if (!Number.isFinite(cutoffPass)) {
      return false;
    }

    let mutated = false;

    for (let index = history.length - 1; index >= 0; index -= 1) {
      const entry = history[index];
      if (!entry || typeof entry !== 'object') {
        continue;
      }

      if (entry.role === 'system') {
        continue;
      }

      if (!Number.isFinite(entry.pass) || (entry.pass as number) >= cutoffPass) {
        continue;
      }

      let parseResult: ParseResult | null = null;
      let hasParsed = false;
      let parsedSuccessfully = false;
      let parsedContent: unknown = null;
      let shouldRemove = false;
      let shouldRewrite = false;

      const ensureParsed = () => {
        if (!hasParsed) {
          parseResult = safeParse(entry.content);
          parsedContent = parseResult.value;
          parsedSuccessfully = parseResult.parsed;
          hasParsed = true;
        }
        return parsedContent;
      };

      const context: AmnesiaRuleContext = {
        entry,
        readContent: () => ensureParsed(),
        removeEntry: () => {
          shouldRemove = true;
        },
        rewriteContent: (nextContent) => {
          ensureParsed();
          parsedContent = nextContent;
          shouldRewrite = true;
        },
      };

      for (const rule of this.rules) {
        if (typeof rule !== 'function') {
          continue;
        }

        try {
          rule(context);
        } catch (error) {
          // Intentionally swallow rule errors so a single faulty rule does not
          // destabilize the agent loop. Debug logging is handled by the caller.
        }

        if (shouldRemove) {
          break;
        }
      }

      if (shouldRemove) {
        history.splice(index, 1);
        mutated = true;
        continue;
      }

      const shouldRewriteEntry = shouldRewrite && hasParsed && parsedSuccessfully;

      if (shouldRewriteEntry) {
        history[index] = createChatMessageEntry({
          ...entry,
          content: stringifyContent(parsedContent, entry.content),
        }) as ChatHistoryEntry;
        mutated = true;
      }
    }

    return mutated;
  }
}

export interface DementiaPolicyOptions {
  history: ChatHistoryEntry[];
  currentPass: number;
  limit?: number;
  preserveSystemMessages?: boolean;
}

export function applyDementiaPolicy({
  history,
  currentPass,
  limit,
  preserveSystemMessages = true,
}: DementiaPolicyOptions): boolean {
  if (!Array.isArray(history) || history.length === 0) {
    return false;
  }

  const normalizedLimit = normalizeThreshold(limit, 0);
  if (!normalizedLimit) {
    return false;
  }

  if (!Number.isFinite(currentPass)) {
    return false;
  }

  const cutoffPass = currentPass - normalizedLimit;
  if (!Number.isFinite(cutoffPass)) {
    return false;
  }

  let removed = false;

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index];
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    if (preserveSystemMessages && entry.role === 'system') {
      continue;
    }

    if (!Number.isFinite(entry.pass)) {
      continue;
    }

    if ((entry.pass as number) < cutoffPass) {
      history.splice(index, 1);
      removed = true;
    }
  }

  return removed;
}

export default AmnesiaManager;
