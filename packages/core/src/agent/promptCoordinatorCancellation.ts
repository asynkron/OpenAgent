import type { EscPayload, EscState } from './escState.js';
import type {
  CancelFn,
  EmitEventFn,
  PromptCoordinatorEvent,
} from './promptCoordinatorTypes.js';

interface PromptCoordinatorCancellationOptions {
  escState: EscState | null;
  cancelFn: CancelFn | null;
  emitEvent: EmitEventFn;
}

export class PromptCoordinatorCancellation {
  private readonly escState: EscState | null;
  private readonly cancelFn: CancelFn | null;
  private readonly emitEvent: EmitEventFn;

  constructor({ escState, cancelFn, emitEvent }: PromptCoordinatorCancellationOptions) {
    this.escState = escState;
    this.cancelFn = cancelFn;
    this.emitEvent = emitEvent;
  }

  handle(payload: EscPayload = null): void {
    this.invokeCancelFn();
    this.triggerEscState(payload);
    this.emitCancellationStatus();
  }

  private invokeCancelFn(): void {
    const cancelFn = this.cancelFn;
    if (!cancelFn) {
      return;
    }

    cancelFn('ui-cancel');
  }

  private triggerEscState(payload: EscPayload): void {
    const escState = this.escState;
    if (!escState || escState.waiters.size === 0) {
      return;
    }

    const trigger = escState.trigger;
    if (typeof trigger !== 'function') {
      return;
    }

    trigger(this.normalizeEscPayload(payload));
  }

  private emitCancellationStatus(): void {
    const event: PromptCoordinatorEvent = {
      type: 'status',
      level: 'warn',
      message: 'Cancellation requested by UI.',
      details: null,
    };

    this.emitEvent(event);
  }

  private normalizeEscPayload(payload: EscPayload): EscPayload {
    if (typeof payload === 'string') {
      return payload;
    }

    if (payload && typeof payload === 'object') {
      const candidate = payload as { reason?: unknown };
      if (typeof candidate.reason === 'string' && candidate.reason.length > 0) {
        return { reason: candidate.reason };
      }
    }

    return { reason: 'ui-cancel' };
  }
}
