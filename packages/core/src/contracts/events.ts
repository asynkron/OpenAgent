/**
 * Canonical runtime events contract for OpenAgent core.
 *
 * Stepwise adoption: this enum lists the event names used across the runtime.
 * We expose a minimal RuntimeEvent envelope to avoid stringly-typed drift while
 * migrating producers/consumers incrementally to use the enum.
 */

export enum RuntimeEventType {
  Status = 'status',
  Debug = 'debug',
  AssistantMessage = 'assistant-message',
  Banner = 'banner',
  Pass = 'pass',
  Thinking = 'thinking',
  Planning = 'planning',
  Plan = 'plan',
  PlanProgress = 'plan-progress',
  ContextUsage = 'context-usage',
  RequestInput = 'request-input',
  Error = 'error',
  // Model request lifecycle
  ModelRequestStarted = 'model_request_started',
  ModelRequestCompleted = 'model_request_completed',
  // Command lifecycle (used by runners and streamers)
  CommandStarted = 'command_started',
  CommandCompleted = 'command_completed',
  CommandOutputChunk = 'command_output_chunk',
  // Human-in-the-loop prompt
  AskHuman = 'ask_human',
}

export interface RuntimeEventPayloadBase {
  message?: string;
  details?: string | null;
}

export interface RuntimeEvent {
  // During migration, allow legacy string event types alongside enum values
  type: RuntimeEventType | string;
  // Keep payload explicit scalars to avoid any/unknown. Specific payloads will
  // be introduced in later steps once all sites import the enum.
  payload: RuntimeEventPayloadBase & {
    [key: string]: string | number | boolean | null | undefined;
  };
}
