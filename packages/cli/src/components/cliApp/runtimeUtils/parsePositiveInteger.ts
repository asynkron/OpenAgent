/**
 * Parse human supplied integers (e.g. `/command 3`) while tolerating strings
 * and other loose runtime types.
 */
export function parsePositiveInteger(value: unknown, defaultValue = 1): number {
  if (value === undefined || value === null) {
    return defaultValue;
  }

  const numericValue = typeof value === 'number' ? value : Number.parseInt(String(value).trim(), 10);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return defaultValue;
  }

  return Math.floor(numericValue);
}
