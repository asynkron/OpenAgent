/**
 * Normalise arbitrary runtime text into a printable string.
 * Unknown values are coerced via `String()` while guarding against exceptions.
 */
export function normaliseAgentText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value == null) {
    return '';
  }
  try {
    return String(value);
  } catch (error) {
    console.warn('Failed to normalise agent value', error);
    return '';
  }
}
