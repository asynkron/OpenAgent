import type { PromptRequestMetadata } from '../prompts/types.js';
import type { EscPayload } from './escState.js';

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

export type PromptCoordinatorEvent =
  | PromptRequestEvent
  | PromptCoordinatorStatusEvent;

export type EmitEventFn = (event: PromptCoordinatorEvent) => void;

export type PromptCancelFn = (reason?: EscPayload) => void;
