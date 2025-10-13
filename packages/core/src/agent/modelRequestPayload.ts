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
import type { ResponseCallOptions } from '../openai/responses.js';
import { OPENAGENT_RESPONSE_TOOL } from './responseToolSchema.js';
import { mapHistoryToModelMessages, type ChatMessageEntry } from './historyEntry.js';

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
  tool: typeof OPENAGENT_RESPONSE_TOOL;
  /** Optional call-level overrides (abort signal, retry policy, etc.). */
  options?: ResponseCallOptions;
}

export interface BuildOpenAgentRequestPayloadOptions {
  model: string;
  history: ChatMessageEntry[];
  options?: ResponseCallOptions;
}

export function buildOpenAgentRequestPayload({
  model,
  history,
  options,
}: BuildOpenAgentRequestPayloadOptions): OpenAgentRequestPayload {
  const messages = mapHistoryToModelMessages(history);

  return {
    model,
    messages,
    tool: OPENAGENT_RESPONSE_TOOL,
    options,
  };
}
