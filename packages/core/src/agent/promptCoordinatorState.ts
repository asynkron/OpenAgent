export type PromptCoordinatorStatus = 'idle' | 'buffering' | 'awaiting-input' | 'closed';

interface PromptCoordinatorState {
  status: PromptCoordinatorStatus;
  buffered: string[];
  waiters: Array<(value: string) => void>;
}

/**
 * Deterministic prompt queue state machine used by {@link PromptCoordinator}.
 *
 * It tracks buffered responses, pending waiters, and ensures every mutation
 * flows through {@link updateStatus} so the public status snapshot stays
 * consistent.
 */
export class PromptCoordinatorStateMachine {
  private readonly state: PromptCoordinatorState;

  constructor() {
    this.state = {
      status: 'idle',
      buffered: [],
      waiters: [],
    };
  }

  isClosed(): boolean {
    return this.state.status === 'closed';
  }

  takeBuffered(): string | null {
    const next = this.state.buffered.shift();
    this.updateStatus();
    return typeof next === 'string' ? next : null;
  }

  registerWaiter(resolve: (value: string) => void): void {
    this.state.waiters.push(resolve);
    this.updateStatus();
  }

  deliver(value: string): void {
    const waiter = this.state.waiters.shift();
    if (waiter) {
      waiter(value);
    } else {
      this.state.buffered.push(value);
    }
    this.updateStatus();
  }

  close(): Array<(value: string) => void> {
    this.state.status = 'closed';
    this.state.buffered.length = 0;
    const drained = this.state.waiters.splice(0, this.state.waiters.length);
    return drained;
  }

  private updateStatus(): void {
    if (this.state.status === 'closed') {
      return;
    }

    if (this.state.buffered.length > 0) {
      this.state.status = 'buffering';
      return;
    }

    if (this.state.waiters.length > 0) {
      this.state.status = 'awaiting-input';
      return;
    }

    this.state.status = 'idle';
  }
}

export default PromptCoordinatorStateMachine;
