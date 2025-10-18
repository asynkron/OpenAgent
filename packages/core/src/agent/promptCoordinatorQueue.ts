import type { PromptRequestMetadata } from '../prompts/types.js';
import { PromptCoordinatorStateMachine } from './promptCoordinatorState.js';
import { normalizePromptMetadata } from './promptMetadataNormalizer.js';
import type {
  EmitEventFn,
  PromptRequestEvent,
} from './promptCoordinatorTypes.js';

/**
 * Small helper that owns the prompt buffering state machine. The public
 * coordinator delegates to this class so event emission and state transitions
 * remain easy to follow.
 */
export class PromptRequestQueue {
  private readonly emitEvent: EmitEventFn;
  private readonly stateMachine: PromptCoordinatorStateMachine;

  constructor(emitEvent: EmitEventFn) {
    this.emitEvent = emitEvent;
    this.stateMachine = new PromptCoordinatorStateMachine();
  }

  request(prompt: string, metadata: PromptRequestMetadata | null): Promise<string> {
    this.emitEvent(this.createRequestEvent(prompt, metadata));

    if (this.stateMachine.isClosed()) {
      return Promise.resolve('');
    }

    const buffered = this.stateMachine.takeBuffered();
    if (buffered !== null) {
      return Promise.resolve(buffered);
    }

    return this.waitForPrompt();
  }

  handlePrompt(value: string): void {
    if (this.stateMachine.isClosed()) {
      return;
    }

    this.stateMachine.deliver(typeof value === 'string' ? value : '');
  }

  close(): void {
    const waiters = this.stateMachine.close();
    for (const resolve of waiters) {
      resolve('');
    }
  }

  private createRequestEvent(
    prompt: string,
    metadata: PromptRequestMetadata | null,
  ): PromptRequestEvent {
    return {
      type: 'request-input',
      prompt,
      metadata: normalizePromptMetadata(metadata),
    };
  }

  private waitForPrompt(): Promise<string> {
    return new Promise((resolve) => {
      this.stateMachine.registerWaiter(resolve);
    });
  }
}

export default PromptRequestQueue;
