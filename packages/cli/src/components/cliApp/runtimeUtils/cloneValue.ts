/**
 * Clone runtime payloads so React state updates always receive fresh references.
 * Prefers the native structured clone when available and safe.
 */
export function cloneValue<T>(value: T): T {
  if (value === undefined || value === null || typeof value !== 'object') {
    return value;
  }

  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch (_error) {
      // Fall back to JSON cloning below when structuredClone rejects
      // function/symbol properties.
    }
  }

  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch (_error) {
    return value;
  }
}
