const STRATEGY_DIRECT = 'direct';
const STRATEGY_CODE_FENCE = 'code_fence';
const STRATEGY_BALANCED_SLICE = 'balanced_slice';

const OPENING_TO_CLOSING = new Map([
  ['{', '}'],
  ['[', ']'],
]);

const CLOSERS = new Set(Array.from(OPENING_TO_CLOSING.values()));

function attemptParse(text, strategy, attempts) {
  try {
    const value = JSON.parse(text);
    return {
      ok: true,
      value,
      normalizedText: text,
      recovery: { strategy },
    };
  } catch (error) {
    attempts.push({ strategy, error });
    return null;
  }
}

function extractFromCodeFence(input) {
  if (typeof input !== 'string') {
    return null;
  }

  const fenceMatch = input.match(/```(?:json)?\s*([\s\S]+?)```/i);
  if (!fenceMatch) {
    return null;
  }

  return fenceMatch[1]?.trim() ?? null;
}

function extractBalancedJson(input) {
  if (typeof input !== 'string') {
    return null;
  }

  let inString = false;
  let escaped = false;
  const stack = [];
  let startIndex = -1;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (OPENING_TO_CLOSING.has(char)) {
      if (stack.length === 0) {
        startIndex = index;
      }
      stack.push(OPENING_TO_CLOSING.get(char));
      continue;
    }

    if (CLOSERS.has(char)) {
      if (stack.length === 0) {
        continue;
      }

      const expected = stack.pop();
      if (char !== expected) {
        // Mismatched closing token; bail out.
        return null;
      }

      if (stack.length === 0 && startIndex !== -1) {
        return input.slice(startIndex, index + 1).trim();
      }
    }
  }

  return null;
}

export function parseAssistantResponse(rawContent) {
  const attempts = [];

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
  if (primaryError && typeof primaryError.message === 'string') {
    messageParts.push(primaryError.message);
  }

  return {
    ok: false,
    error: new Error(messageParts.join(' ')),
    attempts,
  };
}

export default {
  parseAssistantResponse,
};
