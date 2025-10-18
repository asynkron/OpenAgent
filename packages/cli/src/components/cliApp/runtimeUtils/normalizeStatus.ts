import type {
  StatusRuntimeEvent,
  StatusLikePayload,
  TimelineStatusPayload,
} from '../types.js';

/**
 * Normalize status payloads before appending them to the timeline. Rejects
 * events without a user-visible message to avoid empty rows in the UI.
 */
export function normalizeStatus(
  event:
    | StatusRuntimeEvent
    | StatusLikePayload
    | null
    | undefined,
): TimelineStatusPayload | null {
  if (!event || typeof event !== 'object') {
    return null;
  }

  const message = typeof event.message === 'string' ? event.message.trim() : '';
  if (!message) {
    return null;
  }

  const normalized: TimelineStatusPayload = { message };

  if (typeof event.level === 'string') {
    const level = event.level.trim();
    if (level) {
      normalized.level = level;
    }
  }

  if (event.details !== undefined && event.details !== null) {
    normalized.details = String(event.details);
  }

  return normalized;
}
