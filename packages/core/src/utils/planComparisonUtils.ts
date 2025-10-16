export const valuesAreEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) {
    return true;
  }

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) {
      return false;
    }

    if (a.length !== b.length) {
      return false;
    }

    for (let index = 0; index < a.length; index += 1) {
      if (!valuesAreEqual(a[index], b[index])) {
        return false;
      }
    }

    return true;
  }

  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') {
    return false;
  }

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) {
    return false;
  }

  const seen = new Set(keysB);
  for (const key of keysA) {
    if (!seen.has(key)) {
      return false;
    }

    if (!valuesAreEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
      return false;
    }
  }

  return true;
};

export const commandsAreEqual = (existingCommand: unknown, incomingCommand: unknown): boolean => {
  if (!existingCommand || typeof existingCommand !== 'object') {
    return false;
  }

  if (!incomingCommand || typeof incomingCommand !== 'object') {
    return false;
  }

  return valuesAreEqual(existingCommand, incomingCommand);
};
