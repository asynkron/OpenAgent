import type { EscPayload, EscState } from './escState.js';
import type { PromptRequestMetadata } from '../prompts/types.js';
import { PromptCoordinatorStateMachine } from './promptCoordinatorState.js';
import { normalizePromptMetadata } from './promptMetadataNormalizer.js';
import { cancelPendingPrompt, forwardEscCancellation } from './promptCoordinatorCancellation.js';

export type { PromptRequestMetadata, PromptRequestScope } from '../prompts/types.js';

/**
 * The runtime differentiates between prompt scopes so downstream hosts can
 * decide which queue (general input vs. approval) should receive the next
 * response. We keep the union open-ended to allow experiments without
 * updating the coordinator every time a new scope appears.
 */
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
  details?: string | null;
  __id?: string;
}

export type PromptCoordinatorEvent = PromptRequestEvent | PromptCoordinatorStatusEvent;

export type EmitEventFn = (event: PromptCoordinatorEvent) => void;
export type CancelFn = (reason?: EscPayload) => void;

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
  private readonly stateMachine: PromptCoordinatorStateMachine;

  constructor({ emitEvent, escState, cancelFn }: PromptCoordinatorOptions = {}) {
    this.emitEvent = typeof emitEvent === 'function' ? emitEvent : () => {};
    this.escState = escState || null;
    this.cancelFn = typeof cancelFn === 'function' ? cancelFn : null;
    this.stateMachine = new PromptCoordinatorStateMachine();
  }

  request(prompt: string, metadata?: PromptRequestMetadata | null): Promise<string> {
    const event: PromptRequestEvent = {
      type: 'request-input',
      prompt,
      metadata: normalizePromptMetadata(metadata ?? null),
    };

    this.emitEvent(event);

    if (this.stateMachine.isClosed()) {
      return Promise.resolve('');
    }

    const buffered = this.stateMachine.takeBuffered();
    if (typeof buffered === 'string') {
      return Promise.resolve(buffered);
    }

    return new Promise((resolve) => {
      this.stateMachine.registerWaiter(resolve);
    });
  }

  handlePrompt(value: string): void {
    if (this.stateMachine.isClosed()) {
      return;
    }

    const normalized = typeof value === 'string' ? value : '';
    this.stateMachine.deliver(normalized);
  }

  handleCancel(payload: EscPayload = null): void {
    cancelPendingPrompt(this.cancelFn);
    forwardEscCancellation(this.escState, payload);
    this.emitCancellationStatus();
  }

  close(): void {
    const waiters = this.stateMachine.close();
    for (const resolve of waiters) {
      resolve('');
    }
  }

  private emitCancellationStatus(): void {
    this.emitEvent({
      type: 'status',
      level: 'warn',
      message: 'Cancellation requested by UI.',
      details: null,
    });
  }
}

export default PromptCoordinator;
