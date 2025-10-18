/**
 * Canonical DTO barrel for OpenAgent.
 *
 * Keeps the shared contracts (interfaces, Zod schemas, JSON schema wrappers)
 * in one discoverable place while allowing the underlying implementations to
 * live in focused modules.
 */

import { PlanStatus, TERMINAL_PLAN_STATUSES } from './planStatus.js';
import type {
  PlanResponse,
  PlanObservation,
  PlanObservationMetadata,
  PlanObservationPayload,
  PlanStep,
} from './plan.js';
import type { CommandDraft, CommandDefinition, CommandExecutionDetails } from './command.js';
import type {
  ChatMessageContent,
  ChatMessageContentPart,
  ChatMessageEntry,
  ChatMessagePayload,
} from './history.js';

import { CommandSchema } from './commandSchema.js';
import {
  PlanObservationMetadataSchema,
  PlanObservationPayloadSchema,
  PlanObservationSchema,
  PlanResponseSchema,
  PlanStepSchema,
} from './planSchemas.js';
import {
  PlanResponseJsonSchema,
  RuntimePlanResponseJsonSchema,
  ToolDefinition,
} from './planJsonSchema.js';
import { requestModelCompletion } from './modelRequestBridge.js';
import {
  AiResponseFunctionCall,
  AiResponseMessage,
  AiResponseMessageContent,
  AiResponseOutput,
  StructuredModelResponse,
  TextModelResponse,
} from './modelResponseTypes.js';

export { PlanStatus, TERMINAL_PLAN_STATUSES };
export type { CommandDraft, CommandDefinition, CommandExecutionDetails };
export type {
  PlanResponse,
  PlanObservation,
  PlanObservationMetadata,
  PlanObservationPayload,
  PlanStep,
};
export type { ChatMessageContent, ChatMessageContentPart, ChatMessageEntry, ChatMessagePayload };

export { CommandSchema };
export {
  PlanObservationMetadataSchema,
  PlanObservationPayloadSchema,
  PlanObservationSchema,
  PlanResponseSchema,
  PlanStepSchema,
};
export { PlanResponseJsonSchema, RuntimePlanResponseJsonSchema, ToolDefinition };

export type {
  OpenAgentRequestPayload as ModelRequest,
  BuildOpenAgentRequestPayloadOptions as ModelRequestBuildOptions,
} from '../agent/modelRequestPayload.js';

export type {
  CreateResponseResult as ModelResponse,
  ResponseCallOptions as AiCallOptions,
  ResponsesClient as AiClient,
} from '../openai/responses.js';

export type {
  AiResponseFunctionCall,
  AiResponseMessage,
  AiResponseMessageContent,
  AiResponseOutput,
  StructuredModelResponse,
  TextModelResponse,
};

export type {
  ModelCompletionResult as ModelCompletion,
  ModelCompletionSuccess,
  ModelCompletionCanceled,
  RequestModelCompletionOptions as ModelCompletionOptions,
} from '../agent/modelRequest.js';

export { requestModelCompletion };

export type {
  ChatMessageEntry as ChatHistoryEntry,
  ModelChatMessage as ChatModelMessage,
} from '../agent/historyEntry.js';

export type {
  ObservationForLLM as OpenAgentObservationPayload,
  ObservationMetadata as OpenAgentObservationMetadata,
  ObservationRecord as OpenAgentObservation,
} from '../agent/historyMessageBuilder.js';

export { extractOpenAgentToolCall, extractResponseText } from '../openai/responseUtils.js';

export type ToolCall = {
  name: 'open-agent';
  call_id: string | null;
  arguments: string;
};

export type { OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
