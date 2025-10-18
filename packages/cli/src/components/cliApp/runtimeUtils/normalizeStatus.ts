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

  const payload = 'payload' in event && event.payload
    ? (event.payload as StatusLikePayload)
    : (event as StatusLikePayload);

  const message = typeof payload.message === 'string' ? payload.message.trim() : '';
  if (!message) {
    return null;
  }

  const normalized: TimelineStatusPayload = { message };

  if (typeof payload.level === 'string') {
    const level = payload.level.trim();
    if (level) {
      normalized.level = level;
    }
  }

  if (payload.details !== undefined && payload.details !== null) {
    const details = typeof payload.details === 'string' ? payload.details : String(payload.details);
    normalized.details = details;
  }

  return normalized;
}
