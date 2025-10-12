const REFUSAL_AUTO_RESPONSE = 'continue';
const REFUSAL_STATUS_MESSAGE =
  'Assistant declined to help; auto-responding with "continue" to prompt another attempt.';
const REFUSAL_MESSAGE_MAX_LENGTH = 160;

const REFUSAL_NEGATION_PATTERNS = [
  /\bcan['’]?t\b/i,
  /\bcannot\b/i,
  /\bunable to\b/i,
  /\bnot able to\b/i,
  /\bwon['’]?t be able to\b/i,
];

const REFUSAL_ASSISTANCE_PATTERNS = [/\bhelp\b/i, /\bassist\b/i, /\bcontinue\b/i];

const REFUSAL_SORRY_PATTERN = /\bsorry\b/i;

export interface RefusalHeuristics {
  autoResponse: string;
  statusMessage: string;
  isLikelyRefusalMessage(message: unknown): boolean;
}

const normalizeAssistantMessage = (value: unknown): string =>
  typeof value === 'string' ? value.replace(/[\u2018\u2019]/g, "'") : '';

const isLikelyRefusalMessage = (message: unknown): boolean => {
  if (typeof message !== 'string') {
    return false;
  }

  const normalized = normalizeAssistantMessage(message).trim();

  if (!normalized || normalized.length > REFUSAL_MESSAGE_MAX_LENGTH) {
    return false;
  }

  const lowerCased = normalized.toLowerCase();

  if (!REFUSAL_SORRY_PATTERN.test(lowerCased)) {
    return false;
  }

  if (!REFUSAL_ASSISTANCE_PATTERNS.some((pattern) => pattern.test(lowerCased))) {
    return false;
  }

  if (!REFUSAL_NEGATION_PATTERNS.some((pattern) => pattern.test(lowerCased))) {
    return false;
  }

  return true;
};

export const refusalHeuristics: RefusalHeuristics = {
  autoResponse: REFUSAL_AUTO_RESPONSE,
  statusMessage: REFUSAL_STATUS_MESSAGE,
  isLikelyRefusalMessage,
};
