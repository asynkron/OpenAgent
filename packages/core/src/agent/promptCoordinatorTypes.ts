import type { PromptRequestMetadata } from '../prompts/types.js';

/**
 * Prompt request emitted when the runtime needs user input.
 */
export interface PromptRequestEvent {
  type: 'request-input';
  prompt: string;
  metadata: PromptRequestMetadata;
  __id?: string;
}

/**
 * Status update emitted when the coordinator needs to report back to the UI.
 */
export interface PromptCoordinatorStatusEvent {
  type: 'status';
  level: string;
  message: string;
  details?: string | null;
  __id?: string;
}

export type PromptCoordinatorEvent = PromptRequestEvent | PromptCoordinatorStatusEvent;

export type EmitEventFn = (event: PromptCoordinatorEvent) => void;

import type { EscPayload } from './escState.js';

export type CancelFn = (reason?: EscPayload) => void;

export type { PromptRequestMetadata };
