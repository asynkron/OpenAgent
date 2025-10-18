/**
 * Strongly typed envelope for AI SDK completion requests.
 *
 * Responsibilities:
 * - Normalize chat history entries into the model-compatible message array.
 * - Capture the tool definition paired with each request so downstream code can
 *   reason about the payload in a typed manner.
 *
 * Consumers:
 * - `modelRequest.ts` when preparing the AI SDK call.
 * - Tests that assert the request envelope emitted by the runtime.
 */
import type { ModelMessage } from 'ai';
import type { AiCallOptions } from '../contracts/index.js';
import { ToolDefinition } from '../contracts/index.js';
import { mapHistoryToModelMessages, type ChatMessageEntry } from './historyEntry.js';

/**
 * API FROZEN: DO NOT CHANGE
 * Request envelope sent to the AI SDK.
 */
export interface OpenAgentRequestPayload {
  /** Model identifier resolved from the runtime configuration. */
  model: string;
  /**
   * Conversation history projected into the shape expected by the AI SDK.
   * Typed as `ModelMessage[]` so callers receive rich editor hints when
   * inspecting the request they are about to issue.
   */
  messages: ModelMessage[];
  /** Tool contract the model must target when producing structured output. */
  tool: typeof ToolDefinition;
  /** Optional call-level overrides (abort signal, retry policy, etc.). */
  options?: AiCallOptions;
}

/**
 * API FROZEN: DO NOT CHANGE
 * Options for constructing the frozen OpenAgentRequestPayload.
 */
export interface BuildOpenAgentRequestPayloadOptions {
  model: string;
  history: ChatMessageEntry[];
  options?: AiCallOptions;
}

/**
 * API FROZEN: DO NOT CHANGE
 * Stable builder and DTO for model request payloads. This defines the exact
 * contract used when calling the AI SDK (model, messages, and the OpenAgent tool).
 * Coordinate any changes via a versioned migration and major release.
 */
export function buildOpenAgentRequestPayload({
  model,
  history,
  options,
}: BuildOpenAgentRequestPayloadOptions): OpenAgentRequestPayload {
  const messages = mapHistoryToModelMessages(history);

  return {
    model,
    messages,
    tool: ToolDefinition,
    options,
  };
}
