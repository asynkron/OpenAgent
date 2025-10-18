import type { EscPayload, EscState } from './escState.js';
import { PromptCoordinatorStateMachine } from './promptCoordinatorState.js';
import { normalizePromptMetadata } from './promptMetadataNormalizer.js';
import { PromptCoordinatorCancellation } from './promptCoordinatorCancellation.js';
import type { CancelFn, EmitEventFn, PromptRequestEvent, PromptRequestMetadata } from './promptCoordinatorTypes.js';

export type {
  CancelFn,
  EmitEventFn,
  PromptCoordinatorEvent,
  PromptCoordinatorStatusEvent,
  PromptRequestEvent,
  PromptRequestMetadata,
} from './promptCoordinatorTypes.js';
export type { PromptRequestScope } from '../prompts/types.js';

/**
 * The runtime differentiates between prompt scopes so downstream hosts can
 * decide which queue (general input vs. approval) should receive the next
 * response. We keep the union open-ended to allow experiments without
 * updating the coordinator every time a new scope appears.
 */
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
  private readonly stateMachine: PromptCoordinatorStateMachine;
  private readonly cancellation: PromptCoordinatorCancellation;

  constructor({ emitEvent, escState, cancelFn }: PromptCoordinatorOptions = {}) {
    const normalizedEmitEvent = typeof emitEvent === 'function' ? emitEvent : () => {};
    const normalizedEscState = escState || null;
    const normalizedCancelFn = typeof cancelFn === 'function' ? cancelFn : null;

    this.emitEvent = normalizedEmitEvent;
    this.stateMachine = new PromptCoordinatorStateMachine();
    this.cancellation = new PromptCoordinatorCancellation({
      emitEvent: normalizedEmitEvent,
      escState: normalizedEscState,
      cancelFn: normalizedCancelFn,
    });
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
    this.cancellation.handle(payload);
  }

  close(): void {
    const waiters = this.stateMachine.close();
    for (const resolve of waiters) {
      resolve('');
    }
  }
}

export default PromptCoordinator;
