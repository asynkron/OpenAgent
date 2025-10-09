const STRATEGY_DIRECT = 'direct';
const STRATEGY_CODE_FENCE = 'code_fence';
const STRATEGY_BALANCED_SLICE = 'balanced_slice';
const STRATEGY_ESCAPED_NEWLINES = 'escaped_newlines';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function firstNonEmptyString(...candidates) {
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') {
      continue;
    }

    const trimmed = candidate.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return '';
}

function escapeBareLineBreaks(input) {
  if (typeof input !== 'string') {
    return null;
  }

  if (!/(?:\r\n|\n|\r)/.test(input)) {
    return null;
  }

  return input.replace(/\r?\n/g, '\\n');
}

function normalizeFlatCommand(command) {
  const runString = firstNonEmptyString(command.run);
  const shellString = firstNonEmptyString(command.shell);

  if (runString) {
    const { run: _ignoredRun, shell: _ignoredShell, ...rest } = command;
    const normalized = { ...rest, run: runString };
    if (shellString) {
      normalized.shell = shellString;
    }
    return normalized;
  }

  if (shellString) {
    const { shell: _ignoredShell, ...rest } = command;
    return { ...rest, run: shellString };
  }

  return { ...command };
}

function normalizeNestedRunCommand(command) {
  const nested = command.run;
  if (!isPlainObject(nested)) {
    return normalizeFlatCommand(command);
  }

  const { run: nestedRun, command: nestedCommand, shell: nestedShell, ...nestedRest } = nested;
  const { run: _ignoredRun, shell: topLevelShell, ...rest } = command;

  const merged = { ...rest, ...nestedRest };
  const runString = firstNonEmptyString(nestedCommand, nestedRun);
  const shellString = firstNonEmptyString(nestedShell, topLevelShell);

  if (runString) {
    merged.run = runString;
  } else if (shellString) {
    merged.run = shellString;
  }

  if (shellString && merged.run && shellString !== merged.run) {
    merged.shell = shellString;
  }

  return merged;
}

function normalizeNestedShellCommand(command) {
  const nested = command.shell;
  if (!isPlainObject(nested)) {
    return normalizeFlatCommand(command);
  }

  const { command: nestedCommand, run: nestedRun, shell: nestedShell, ...nestedRest } = nested;
  const { shell: _ignoredShell, ...rest } = command;

  const merged = { ...nestedRest, ...rest };
  const runString = firstNonEmptyString(rest.run, nestedCommand, nestedRun);
  const shellString = firstNonEmptyString(nestedShell);

  if (runString) {
    merged.run = runString;
  }

  if (shellString && shellString !== merged.run) {
    merged.shell = shellString;
  }

  return merged;
}

function normalizeCommandPayload(command) {
  if (typeof command === 'string') {
    const trimmed = command.trim();
    if (!trimmed) {
      return {};
    }
    return { run: trimmed };
  }

  if (Array.isArray(command)) {
    const parts = command
      .map((part) => {
        if (typeof part === 'string') {
          return part.trim();
        }
        if (part === null || part === undefined) {
          return '';
        }
        return String(part).trim();
      })
      .filter((part) => part);

    if (parts.length === 0) {
      return {};
    }

    return { run: parts.join(' ') };
  }

  if (!isPlainObject(command)) {
    return command;
  }

  if (isPlainObject(command.run)) {
    return normalizeNestedRunCommand(command);
  }

  if (isPlainObject(command.shell)) {
    return normalizeNestedShellCommand(command);
  }

  return normalizeFlatCommand(command);
}

function normalizeAssistantPayload(payload) {
  if (!isPlainObject(payload)) {
    return payload;
  }

  const normalized = { ...payload };

  if ('command' in normalized) {
    normalized.command = normalizeCommandPayload(normalized.command);
  }

  return normalized;
}

const OPENING_TO_CLOSING = new Map([
  ['{', '}'],
  ['[', ']'],
]);

const CLOSERS = new Set(Array.from(OPENING_TO_CLOSING.values()));

function attemptParse(text, strategy, attempts) {
  try {
    const value = JSON.parse(text);
    const normalizedValue = normalizeAssistantPayload(value);
    return {
      ok: true,
      value: normalizedValue,
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
