export const escapeBareLineBreaks = (input: unknown): string | null => {
  if (typeof input !== 'string') {
    return null;
  }

  if (!/(?:\r\n|\n|\r)/.test(input)) {
    return null;
  }

  return input.replace(/\r?\n/g, '\\n');
};

export const extractFromCodeFence = (input: unknown): string | null => {
  if (typeof input !== 'string') {
    return null;
  }

  const fenceMatch = input.match(/```(?:json)?\s*([\s\S]+?)```/i);
  if (!fenceMatch) {
    return null;
  }

  return fenceMatch[1]?.trim() ?? null;
};

const OPENING_TO_CLOSING = new Map<string, string>([
  ['{', '}'],
  ['[', ']'],
]);

const CLOSERS = new Set<string>(Array.from(OPENING_TO_CLOSING.values()));

export const extractBalancedJson = (input: unknown): string | null => {
  if (typeof input !== 'string') {
    return null;
  }

  let inString = false;
  let escaped = false;
  const stack: string[] = [];
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
      stack.push(OPENING_TO_CLOSING.get(char)!);
      continue;
    }

    if (CLOSERS.has(char)) {
      if (stack.length === 0) {
        continue;
      }

      const expected = stack.pop();
      if (char !== expected) {
        return null;
      }

      if (stack.length === 0 && startIndex !== -1) {
        return input.slice(startIndex, index + 1).trim();
      }
    }
  }

  return null;
};
