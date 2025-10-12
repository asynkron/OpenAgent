/**
 * Coordinates prompt requests coming from the agent runtime with responses from the UI layer.
 *
 * Responsibilities:
 * - Buffer prompt responses while the runtime waits for input.
 * - Relay UI cancellation requests to the shared ESC state.
 *
 * Consumers:
 * - Agent loop when requesting human input.
 *
 * Note: The runtime still imports the compiled `promptCoordinator.js`; run `tsc`
 * to regenerate it after editing this source until the build pipeline emits from
 * TypeScript directly.
 */
import type { EscState } from './escState.js';

export type EmitEventFn = (event: Record<string, unknown>) => void;
export type CancelFn = (reason?: unknown) => void;

export interface PromptCoordinatorOptions {
  emitEvent?: EmitEventFn;
  escState?: EscState | null;
  cancelFn?: CancelFn | null;
}

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

  request(prompt: string, metadata: Record<string, unknown> = {}): Promise<string> {
    this.emitEvent({ type: 'request-input', prompt, metadata });

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
