import { createChatMessageEntry } from './historyEntry.js';

const JSON_INDENT = 2;
const DEFAULT_THRESHOLD = 10;

const DEFAULT_RULES = [
  // Drop bulky plan update entries once they are older than the configured threshold.
  ({ readContent, removeEntry }) => {
    const content = readContent();
    if (!content || typeof content !== 'object') {
      return;
    }

    if (content.type === 'plan-update') {
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

    const updated = { ...content };
    delete updated.plan;
    rewriteContent(updated);
  },
];

function safeParse(value) {
  if (typeof value !== 'string') {
    return { parsed: false, value: null };
  }

  try {
    return { parsed: true, value: JSON.parse(value) };
  } catch (error) {
    return { parsed: false, value: null };
  }
}

function stringifyContent(value, fallback) {
  if (typeof value === 'undefined') {
    return fallback;
  }

  try {
    return JSON.stringify(value, null, JSON_INDENT);
  } catch (error) {
    return fallback;
  }
}

function normalizeThreshold(threshold, defaultValue) {
  if (typeof threshold !== 'number') {
    return defaultValue;
  }

  const finite = Number.isFinite(threshold) ? threshold : defaultValue;
  if (finite <= 0) {
    return 0;
  }

  return Math.floor(finite);
}

export class AmnesiaManager {
  constructor({ threshold = DEFAULT_THRESHOLD, rules = DEFAULT_RULES } = {}) {
    this.threshold = normalizeThreshold(threshold, DEFAULT_THRESHOLD);
    this.rules = Array.isArray(rules) && rules.length > 0 ? rules.slice() : DEFAULT_RULES;
  }

  apply({ history, currentPass }) {
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

      if (!Number.isFinite(entry.pass) || entry.pass >= cutoffPass) {
        continue;
      }

      let parseResult = null;
      let hasParsed = false;
      let parsedContent = null;
      let shouldRemove = false;
      let shouldRewrite = false;

      const ensureParsed = () => {
        if (!hasParsed) {
          parseResult = safeParse(entry.content);
          parsedContent = parseResult.value;
          hasParsed = true;
        }
        return parsedContent;
      };

      const context = {
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

      if (shouldRewrite && hasParsed && parseResult && parseResult.parsed) {
        history[index] = createChatMessageEntry({
          ...entry,
          content: stringifyContent(parsedContent, entry.content),
        });
        mutated = true;
      }
    }

    return mutated;
  }
}

export function applyDementiaPolicy({
  history,
  currentPass,
  limit,
  preserveSystemMessages = true,
}) {
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

    if (entry.pass < cutoffPass) {
      history.splice(index, 1);
      removed = true;
    }
  }

  return removed;
}

export default AmnesiaManager;
