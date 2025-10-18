import type { EscPayload, EscState } from './escState.js';

const DEFAULT_CANCEL_REASON: EscPayload = { reason: 'ui-cancel' };

type CancelHandler = ((reason?: EscPayload) => void) | null;

/**
 * Propagates the UI-driven cancellation back to the consumer-supplied cancel
 * hook. Keeping this helper free-standing means the main coordinator can stay
 * linear while still accepting optional cancellation wiring.
 */
export function cancelPendingPrompt(cancelFn: CancelHandler): void {
  if (!cancelFn) {
    return;
  }

  cancelFn('ui-cancel');
}

function normalizeEscPayload(payload: EscPayload): EscPayload {
  if (typeof payload === 'string') {
    return payload;
  }

  if (payload && typeof payload === 'object') {
    const reason = (payload as { reason?: unknown }).reason;
    if (typeof reason === 'string' && reason.length > 0) {
      return { reason };
    }
  }

  return DEFAULT_CANCEL_REASON;
}

/**
 * Notifies ESC waiters that a UI cancellation occurred. We guard trigger
 * existence to avoid calling into partially wired ESC states.
 */
export function forwardEscCancellation(escState: EscState | null, payload: EscPayload): void {
  if (!escState || escState.waiters.size === 0) {
    return;
  }

  const trigger = typeof escState.trigger === 'function' ? escState.trigger : null;
  if (!trigger) {
    return;
  }

  trigger(normalizeEscPayload(payload));
}
