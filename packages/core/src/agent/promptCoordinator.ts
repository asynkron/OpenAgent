import type { EscState } from './escState.js';

/**
 * The runtime differentiates between prompt scopes so downstream hosts can
 * decide which queue (general input vs. approval) should receive the next
 * response. We keep the union open-ended to allow experiments without
 * updating the coordinator every time a new scope appears.
 */
export type PromptRequestScope = 'user-input' | 'approval' | (string & {});

/**
 * Metadata that accompanies prompt requests. The scope is the only required
 * field today, but the record stays extensible so callers can flow additional
 * context (e.g. prompt identifiers) without loosening the type to `unknown`.
 */
export interface PromptRequestMetadata extends Record<string, unknown> {
  scope: PromptRequestScope;
}

export interface PromptRequestEvent {
  type: 'request-input';
  prompt: string;
  metadata: PromptRequestMetadata;
  __id?: string;
}

export interface PromptCoordinatorStatusEvent {
  type: 'status';
  level: string;
  message: string;
  details?: unknown;
  __id?: string;
}

export type PromptCoordinatorEvent = PromptRequestEvent | PromptCoordinatorStatusEvent;

export type EmitEventFn = (event: PromptCoordinatorEvent) => void;
export type CancelFn = (reason?: unknown) => void;

export interface PromptCoordinatorOptions {
  emitEvent?: EmitEventFn;
  escState?: EscState | null;
  cancelFn?: CancelFn | null;
}

/**
 * Coordinates prompt requests coming from the agent runtime with responses
 * supplied by UI layers. It buffers inputs until the runtime awaits them and
 * forwards UI-driven cancellations back to the shared ESC state.
 */
export class PromptCoordinator {
  private readonly emitEvent: EmitEventFn;
  private readonly escState: EscState | null;
  private readonly cancelFn: CancelFn | null;
  private readonly buffered: string[];
  private readonly waiters: Array<(value: string) => void>;

  constructor({ emitEvent, escState, cancelFn }: PromptCoordinatorOptions = {}) {
    this.emitEvent = typeof emitEvent === 'function' ? emitEvent : () => {};
    this.escState = escState || null;
    this.cancelFn = typeof cancelFn === 'function' ? cancelFn : null;

    this.buffered = [];
    this.waiters = [];
  }

  private resolveNext(value: string): boolean {
    if (this.waiters.length > 0) {
      const resolve = this.waiters.shift();
      if (resolve) {
        resolve(value);
        return true;
      }
    }
    this.buffered.push(value);
    return false;
  }

  private normalizeMetadata(metadata: PromptRequestMetadata | null | undefined): PromptRequestMetadata {
    if (metadata && typeof metadata === 'object') {
      const scope =
        typeof metadata.scope === 'string' && metadata.scope.trim().length > 0
          ? metadata.scope
          : 'user-input';
      return { ...metadata, scope };
    }

    return { scope: 'user-input' };
  }

  request(prompt: string, metadata?: PromptRequestMetadata | null): Promise<string> {
    const event: PromptRequestEvent = {
      type: 'request-input',
      prompt,
      metadata: this.normalizeMetadata(metadata ?? null),
    };

    this.emitEvent(event);

    if (this.buffered.length > 0) {
      const next = this.buffered.shift();
      return Promise.resolve(typeof next === 'string' ? next : '');
    }

    return new Promise((resolve) => {
      this.waiters.push(resolve);
    });
  }

  handlePrompt(value: string): void {
    this.resolveNext(typeof value === 'string' ? value : '');
  }

  handleCancel(payload: unknown = null): void {
    if (this.cancelFn) {
      this.cancelFn('ui-cancel');
    }

    const escState = this.escState;
    const hasEscWaiters = Boolean(
      escState &&
        escState.waiters &&
        typeof escState.waiters.size === 'number' &&
        escState.waiters.size > 0,
    );

    if (hasEscWaiters && escState) {
      escState.trigger?.(payload ?? { reason: 'ui-cancel' });
    }

    this.emitEvent({ type: 'status', level: 'warn', message: 'Cancellation requested by UI.' });
  }

  close(): void {
    while (this.waiters.length > 0) {
      const resolve = this.waiters.shift();
      if (resolve) {
        resolve('');
      }
    }
  }
}

export default PromptCoordinator;
