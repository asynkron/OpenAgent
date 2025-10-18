import type { EscPayload, EscState } from './escState.js';
import type {
  PromptMetadataEntry,
  PromptRequestMetadata,
  PromptRequestScope,
} from '../prompts/types.js';

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

  private normalizeMetadata(
    metadata: PromptRequestMetadata | null | undefined,
  ): PromptRequestMetadata {
    const scope =
      metadata && typeof metadata.scope === 'string' && metadata.scope.trim().length > 0
        ? (metadata.scope as PromptRequestScope)
        : ('user-input' as PromptRequestScope);

    const promptId = metadata && typeof metadata.promptId === 'string' ? metadata.promptId : null;
    const description =
      metadata && typeof metadata.description === 'string' ? metadata.description : null;
    const tags =
      metadata && Array.isArray(metadata.tags)
        ? metadata.tags.filter((tag): tag is string => typeof tag === 'string')
        : [];
    const extraEntries =
      metadata && Array.isArray(metadata.extra)
        ? metadata.extra
            .map((entry) => ({
              key: typeof entry.key === 'string' ? entry.key : String(entry.key),
              value: entry.value ?? null,
            }))
            .filter((entry: PromptMetadataEntry) => entry.key.length > 0)
        : [];

    return {
      scope,
      promptId,
      description,
      tags,
      extra: extraEntries,
    };
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

  handleCancel(payload: EscPayload = null): void {
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
      let normalizedPayload: string | { reason: string } | null = null;
      if (typeof payload === 'string') {
        normalizedPayload = payload;
      } else if (payload && typeof payload === 'object') {
        const candidate = payload as { reason?: unknown };
        if (typeof candidate.reason === 'string') {
          normalizedPayload = { reason: candidate.reason };
        } else {
          normalizedPayload = { reason: 'ui-cancel' };
        }
      } else {
        normalizedPayload = { reason: 'ui-cancel' };
      }

      escState.trigger?.(normalizedPayload);
    }

    this.emitEvent({
      type: 'status',
      level: 'warn',
      message: 'Cancellation requested by UI.',
      details: null,
    });
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
