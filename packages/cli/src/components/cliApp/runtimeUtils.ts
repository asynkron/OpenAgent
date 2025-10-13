import type { AgentRuntimeLike, CliAppProps, StatusRuntimeEvent, TimelineStatusPayload } from './types.js';

/**
 * Clone runtime payloads so downstream React state updates always receive a new
 * reference. Falls back to a JSON round-trip when `structuredClone` is not
 * available or throws for non-cloneable values.
 */
export function cloneValue<T>(value: T): T {
  if (value === undefined || value === null || typeof value !== 'object') {
    return value;
  }

  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch (error) {
      // Swallow the error and fall through to the JSON fallback below. Calling
      // `structuredClone` can fail for objects with functions/symbols.
    }
  }

  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch (_error) {
    return value;
  }
}

/**
 * Parse human supplied integers (e.g. `/command 3`) while tolerating strings
 * and other loose runtime types.
 */
export function parsePositiveInteger(value: unknown, defaultValue = 1): number {
  if (value === undefined || value === null) {
    return defaultValue;
  }

  const normalized =
    typeof value === 'number' ? value : Number.parseInt(String(value).trim(), 10);

  if (!Number.isFinite(normalized) || normalized <= 0) {
    return defaultValue;
  }

  return Math.floor(normalized);
}

/**
 * Normalize status payloads before appending them to the timeline. Rejects
 * events without a user-visible message to avoid empty rows in the UI.
 */
export function normalizeStatus(
  event: StatusRuntimeEvent | { message?: string; level?: string; details?: unknown } | null | undefined,
): TimelineStatusPayload | null {
  if (!event || typeof event !== 'object') {
    return null;
  }

  const message = typeof event.message === 'string' ? event.message : '';
  if (!message) {
    return null;
  }

  const normalized: TimelineStatusPayload = {
    message,
  };

  if (typeof event.level === 'string' && event.level.trim()) {
    normalized.level = event.level;
  }

  if (event.details !== undefined && event.details !== null) {
    normalized.details = String(event.details);
  }

  return normalized;
}

/**
 * Narrow an optional runtime prop so downstream logic can call methods without
 * re-checking the object shape in every handler.
 */
export function coerceRuntime(runtime: CliAppProps['runtime']): AgentRuntimeLike | null {
  if (!runtime || typeof runtime !== 'object') {
    return null;
  }

  return runtime as AgentRuntimeLike;
}

