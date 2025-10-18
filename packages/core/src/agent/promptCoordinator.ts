import type { EscPayload, EscState } from './escState.js';
import type { PromptRequestMetadata } from '../prompts/types.js';
import {
  PromptCancellationBridge,
} from './promptCoordinatorCancellation.js';
import {
  type PromptRequestEvent,
  type PromptCoordinatorStatusEvent,
  type PromptCoordinatorEvent,
  type EmitEventFn,
  type PromptCancelFn,
} from './promptCoordinatorTypes.js';
import { PromptRequestQueue } from './promptCoordinatorQueue.js';

export type { PromptRequestMetadata, PromptRequestScope } from '../prompts/types.js';
export type {
  PromptRequestEvent,
  PromptCoordinatorStatusEvent,
  PromptCoordinatorEvent,
  EmitEventFn,
} from './promptCoordinatorTypes.js';

export type CancelFn = PromptCancelFn;

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
  private readonly queue: PromptRequestQueue;
  private readonly cancellationBridge: PromptCancellationBridge;

  constructor({ emitEvent, escState, cancelFn }: PromptCoordinatorOptions = {}) {
    this.emitEvent = typeof emitEvent === 'function' ? emitEvent : () => {};
    this.queue = new PromptRequestQueue(this.emitEvent);
    this.cancellationBridge = new PromptCancellationBridge({
      cancelFn,
      escState,
    });
  }

  request(prompt: string, metadata?: PromptRequestMetadata | null): Promise<string> {
    return this.queue.request(prompt, metadata ?? null);
  }

  handlePrompt(value: string): void {
    this.queue.handlePrompt(value);
  }

  handleCancel(payload: EscPayload = null): void {
    this.cancellationBridge.forwardCancellation(payload);
    this.emitCancellationStatus();
  }

  close(): void {
    this.queue.close();
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
