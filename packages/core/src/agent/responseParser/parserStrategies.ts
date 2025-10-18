import type {
  ParseAttempt,
  ParseSuccess,
  ParseResult,
  RecoveryStrategy,
  AssistantPayload,
} from './parserTypes.js';
import {
  STRATEGY_DIRECT,
  STRATEGY_CODE_FENCE,
  STRATEGY_BALANCED_SLICE,
  STRATEGY_ESCAPED_NEWLINES,
  isPlainObject,
} from './parserTypes.js';
import { normalizeCommandPayload } from './commandNormalizer.js';
import { normalizePlan } from './planNormalizer.js';
import {
  escapeBareLineBreaks,
  extractFromCodeFence,
  extractBalancedJson,
} from './jsonExtractor.js';

const normalizeAssistantPayload = (
  payload: AssistantPayload | unknown,
): AssistantPayload | unknown => {
  if (!isPlainObject(payload)) {
    return payload;
  }

  const normalized: AssistantPayload = { ...(payload as AssistantPayload) };

  if ('command' in normalized) {
    normalized.command = normalizeCommandPayload(normalized.command);
  }

  if (Array.isArray(normalized.plan)) {
    normalized.plan = normalizePlan(normalized.plan);
  }

  return normalized;
};

const attemptParse = (
  text: string,
  strategy: RecoveryStrategy,
  attempts: ParseAttempt[],
): ParseSuccess | null => {
  try {
    const value = JSON.parse(text) as AssistantPayload;
    const normalizedValue = normalizeAssistantPayload(value);
    return {
      ok: true,
      value: normalizedValue as AssistantPayload,
      normalizedText: text,
      recovery: { strategy },
    };
  } catch (error) {
    attempts.push({ strategy, error });
    return null;
  }
};

export const parseAssistantResponse = (rawContent: unknown): ParseResult => {
  const attempts: ParseAttempt[] = [];

  if (typeof rawContent !== 'string' || !rawContent.trim()) {
    return {
      ok: false,
      error: new Error('Assistant response was empty or missing.'),
      attempts,
    };
  }

  const trimmed = rawContent.trim();

  const direct = attemptParse(trimmed, STRATEGY_DIRECT, attempts);
  if (direct) {
    return direct;
  }

  const escapedNewlines = escapeBareLineBreaks(trimmed);
  if (escapedNewlines) {
    const recovered = attemptParse(escapedNewlines, STRATEGY_ESCAPED_NEWLINES, attempts);
    if (recovered) {
      return recovered;
    }
  }

  const fenced = extractFromCodeFence(trimmed);
  if (fenced) {
    const recovered = attemptParse(fenced, STRATEGY_CODE_FENCE, attempts);
    if (recovered) {
      return recovered;
    }
  }

  const sliced = extractBalancedJson(trimmed);
  if (sliced) {
    const recovered = attemptParse(sliced, STRATEGY_BALANCED_SLICE, attempts);
    if (recovered) {
      return recovered;
    }
  }

  const primaryError = attempts[0]?.error;
  const messageParts = ['Failed to parse assistant JSON response.'];
  if (primaryError && typeof (primaryError as Error).message === 'string') {
    messageParts.push((primaryError as Error).message);
  }

  return {
    ok: false,
    error: new Error(messageParts.join(' ')),
    attempts,
  };
};
