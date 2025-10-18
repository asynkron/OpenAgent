import type { EscPayload, EscState, EscTrigger } from './escState.js';
import type { PromptCancelFn } from './promptCoordinatorTypes.js';

/**
 * Normalised bridge for relaying UI-driven cancellations back to the shared
 * ESC state. The prompt coordinator instantiates this helper so the
 * cancellation plumbing stays isolated from request buffering logic.
 */
export class PromptCancellationBridge {
  private readonly cancelFn: PromptCancelFn | null;
  private readonly escState: EscState | null;

  constructor({ cancelFn, escState }: PromptCancellationBridgeOptions) {
    this.cancelFn = typeof cancelFn === 'function' ? cancelFn : null;
    this.escState = escState ?? null;
  }

  forwardCancellation(payload: EscPayload): void {
    if (this.cancelFn) {
      this.cancelFn('ui-cancel');
    }

    const trigger = this.resolveTrigger();
    if (!trigger) {
      return;
    }

    trigger(this.normalizePayload(payload));
  }

  private resolveTrigger(): EscTrigger | null {
    if (!this.escState) {
      return null;
    }

    if (this.escState.waiters.size === 0) {
      return null;
    }

    const candidate = this.escState.trigger;
    return typeof candidate === 'function' ? candidate : null;
  }

  private normalizePayload(payload: EscPayload): EscPayload {
    if (typeof payload === 'string') {
      return payload;
    }

    const reason = this.extractReason(payload);
    if (reason) {
      return { reason };
    }

    return { reason: 'ui-cancel' };
  }

  private extractReason(payload: EscPayload): string | null {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const candidate = payload as { reason?: unknown };
    return typeof candidate.reason === 'string' && candidate.reason.length > 0
      ? candidate.reason
      : null;
  }
}

export interface PromptCancellationBridgeOptions {
  cancelFn: PromptCancelFn | null | undefined;
  escState: EscState | null | undefined;
}

export default PromptCancellationBridge;
