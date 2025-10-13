/**
 * Canonical DTO module for OpenAgent.
 *
 * Purpose
 * - Provide a single import point for all request/response DTOs, tool schema
 *   types, and closely-related data models used around the AI SDK and agent.
 * - Offer consistent, discoverable naming with request/response groupings.
 *
 * Naming Conventions
 * - ModelRequest / ModelResponse — payloads to/from the AI SDK.
 * - ModelCompletion* — result envelope from the runtime call wrapper.
 * - OpenAgentTool* — DTOs produced by the OpenAgent tool schema.
 * - OpenAgentObservation* — observation payloads we send back to the model.
 */

// -----------------------------
// Tool schema and inferred DTOs
// -----------------------------
export {
  OPENAGENT_RESPONSE_TOOL as OpenAgentTool,
  OPENAGENT_RESPONSE_SCHEMA as OpenAgentToolSchema,
  RESPONSE_PARAMETERS_SCHEMA as OpenAgentToolJsonSchema,
} from '../agent/responseToolSchema.js';
export type {
  OpenAgentCommand as OpenAgentToolCommand,
  OpenAgentPlanStep as OpenAgentToolPlanStep,
  OpenAgentResponse as OpenAgentToolResponse,
} from '../agent/responseToolSchema.js';

// ----------------------------------
// Requests (runtime -> AI SDK client)
// ----------------------------------
export {
  buildOpenAgentRequestPayload as buildModelRequest,
} from '../agent/modelRequestPayload.js';
export type {
  OpenAgentRequestPayload as ModelRequest,
  BuildOpenAgentRequestPayloadOptions as ModelRequestBuildOptions,
} from '../agent/modelRequestPayload.js';

// ------------------------------------------------
// AI SDK response union + call options/client types
// ------------------------------------------------
export type {
  CreateResponseResult as ModelResponse,
  ResponseCallOptions as AiCallOptions,
  ResponsesClient as AiClient,
} from '../openai/responses.js';

// ---------------------------------
// Runtime model completion wrapper
// ---------------------------------
export type {
  ModelCompletionResult as ModelCompletion,
  ModelCompletionSuccess,
  ModelCompletionCanceled,
  RequestModelCompletionOptions as ModelCompletionOptions,
} from '../agent/modelRequest.js';

// Lazy re-export to avoid eagerly importing the AI SDK dependencies during tests.
export async function requestModelCompletion(options: import('../agent/modelRequest.js').RequestModelCompletionOptions) {
  const mod = await import('../agent/modelRequest.js');
  return mod.requestModelCompletion(options as any);
}

// -------------------------------
// Chat history projections (DTOs)
// -------------------------------
export type {
  ChatMessageEntry as ChatHistoryEntry,
  ModelChatMessage as ChatModelMessage,
} from '../agent/historyEntry.js';

// --------------------------------
// Observations sent back to the LLM
// --------------------------------
export type {
  ObservationForLLM as OpenAgentObservationPayload,
  ObservationMetadata as OpenAgentObservationMetadata,
  ObservationRecord as OpenAgentObservation,
} from '../agent/historyMessageBuilder.js';

// -------------------------
// Response parsing helpers
// -------------------------
export { extractOpenAgentToolCall, extractResponseText } from '../openai/responseUtils.js';
