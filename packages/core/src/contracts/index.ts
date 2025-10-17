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
 * - Tool* — DTOs produced by the OpenAgent tool schema (ToolResponse, ToolPlanStep, ToolCommand).
 * - OpenAgentObservation* — observation payloads we send back to the model.
 */

// -----------------------------
// Tool schema (Zod) and DTOs
// -----------------------------
import { jsonSchema as asJsonSchema } from '@ai-sdk/provider-utils';
import type { JSONSchema7 } from '@ai-sdk/provider';
import type { GenerateObjectResult, GenerateTextResult, LanguageModel, ToolSet } from 'ai';
import { z } from 'zod';

import { DEFAULT_COMMAND_MAX_BYTES, DEFAULT_COMMAND_TAIL_LINES } from '../constants.js';

type DeepPartial<T> = T extends (...arguments_: any[]) => unknown
  ? T
  : T extends Array<infer U>
    ? Array<DeepPartial<U> | undefined>
    : T extends object
      ? { [K in keyof T]?: DeepPartial<T[K]> }
      : T;

const PLAN_STEP_STATUS_VALUES = ['pending', 'completed', 'failed', 'abandoned'] as const;
const STRICT_COMMAND_REQUIRED_FIELDS = [
  'reason',
  'shell',
  'run',
  'cwd',
  'timeout_sec',
  'filter_regex',
  'tail_lines',
  'max_bytes',
] as const;
const RELAXED_COMMAND_REQUIRED_FIELDS = ['shell', 'run', 'max_bytes'] as const;
const BASE_PLAN_REQUIRED_FIELDS = ['id', 'title', 'status', 'command'] as const;

const PROVIDER_PLAN_DESCRIPTION = `a DAG (Directed Acyclic Graph) of tasks to execute,
      each task executes exactly 1 command, each task can depend
      on 0 or more other tasks to complete before executing.
      User goals should be the last task to execute in the chain of task.
      e.g 'I want to create a guess a number game in js', then 'game created' is the end node in the graph.
      The DAG is designed to do groundwork first, creating files, install packages etc. and to validate, run tests etc as end nodes.
      `;
const RUNTIME_PLAN_DESCRIPTION = "List of steps representing the assistant's current plan.";
const PLAN_ITEM_DESCRIPTION = 'a single task in the DAG plan, represents both the task and the shell command to execute';
const PROVIDER_COMMAND_DESCRIPTION =
  'Next tool invocation to execute for this plan step. This command should complete the task if successful.';
const RUNTIME_COMMAND_DESCRIPTION = 'Command to execute for this plan step.';

const OBSERVATION_PROPERTY_DEFINITIONS: Record<string, JSONSchema7> = {
  observation_for_llm: {
    type: ['object', 'null'],
    additionalProperties: true,
    description:
      'Payload the agent shared with the model. May include command output, plan summaries, or validation errors.',
  },
  observation_metadata: {
    type: ['object', 'null'],
    additionalProperties: true,
    description: 'Metadata describing how/when the observation was produced (timestamps, runtime metrics, etc.).',
  },
};

const COMMAND_PROPERTY_DEFINITIONS: Record<string, JSONSchema7> = {
  reason: {
    type: 'string',
    default: '',
    description:
      'Explain why this shell command is required for the plan step. If only shell or run is provided, justify the omission.',
  },
  shell: {
    type: 'string',
    description:
      'Shell executable to launch when running commands. May only contain value if "run" contains an actual command to run.',
  },
  run: {
    type: 'string',
    description:
      'Command string to execute in the provided shell. Must be set if "shell" has a value; may NOT be set if "shell" has no value.',
  },
  cwd: {
    type: 'string',
    default: '',
    description: 'Working directory for shell execution.',
  },
  timeout_sec: {
    type: 'integer',
    minimum: 1,
    default: 60,
    description: 'Timeout guard for long-running commands (seconds).',
  },
  filter_regex: {
    type: 'string',
    default: '',
    description: 'Regex used to filter command output (empty for none).',
  },
  tail_lines: {
    type: 'integer',
    minimum: 0,
    default: DEFAULT_COMMAND_TAIL_LINES,
    description: 'Number of trailing lines to return from output (0 disables the limit).',
  },
  max_bytes: {
    type: 'integer',
    minimum: 1,
    default: DEFAULT_COMMAND_MAX_BYTES,
    description: `Maximum number of bytes to include from stdout/stderr (defaults to ~${DEFAULT_COMMAND_TAIL_LINES} lines at ${
      DEFAULT_COMMAND_MAX_BYTES / 1024
    } KiB).`,
  },
};

function createCommandSchema(description: string, required: readonly string[]): JSONSchema7 {
  return {
    type: 'object',
    additionalProperties: false,
    description,
    required: Array.from(required),
    properties: COMMAND_PROPERTY_DEFINITIONS,
  } satisfies JSONSchema7;
}

function createPlanItemProperties(flavor: 'provider' | 'runtime'): Record<string, JSONSchema7> {
  const commandDescription = flavor === 'provider' ? PROVIDER_COMMAND_DESCRIPTION : RUNTIME_COMMAND_DESCRIPTION;
  const includeAge = flavor === 'runtime';

  const properties: Record<string, JSONSchema7> = {
    id: {
      type: 'string',
      description: 'Random ID assigned by AI.',
    },
    title: {
      type: 'string',
      description: 'Human readable summary of the plan step.',
    },
    status: {
      type: 'string',
      enum: Array.from(PLAN_STEP_STATUS_VALUES),
      description: `Current execution status for the plan step.
            "failed" tasks, should be "abandoned" by the Assistant
            other plan steps that are waiting for a failed or abandoned step. should now replace that 'id' in their waitingForId array.
            e.g. A is waiting for B, B fails, B should now be abandoned, A should now wait for new task C, where C now can perform another command and try something else to not fail.

            `,
    },
    waitingForId: {
      type: 'array',
      items: { type: 'string' },
      default: [],
      description: 'IDs this task has to wait for before it can be executed (dependencies).',
    },
    command: createCommandSchema(
      commandDescription,
      flavor === 'provider' ? STRICT_COMMAND_REQUIRED_FIELDS : RELAXED_COMMAND_REQUIRED_FIELDS,
    ),
    observation: {
      type: 'object',
      additionalProperties: false,
      description: 'Snapshot of the latest command or plan observation produced for this step.',
      properties: OBSERVATION_PROPERTY_DEFINITIONS,
    },
  };

  if (includeAge) {
    properties.age = { type: 'integer', minimum: 0 };
  }

  return properties;
}

function createToolResponseJsonSchema(flavor: 'provider' | 'runtime'): JSONSchema7 {
  const planDescription = flavor === 'provider' ? PROVIDER_PLAN_DESCRIPTION : RUNTIME_PLAN_DESCRIPTION;
  const planRequired =
    flavor === 'provider'
      ? [...BASE_PLAN_REQUIRED_FIELDS, 'waitingForId']
      : [...BASE_PLAN_REQUIRED_FIELDS];

  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    additionalProperties: false,
    required: ['message', 'plan'],
    properties: {
      message: {
        type: 'string',
        description: 'Markdown formatted message to the user.',
      },
      plan: {
        type: 'array',
        description: planDescription,
        items: {
          type: 'object',
          ...(flavor === 'provider' ? { description: PLAN_ITEM_DESCRIPTION } : {}),
          additionalProperties: false,
          required: planRequired,
          properties: createPlanItemProperties(flavor),
        },
      },
    },
  } satisfies JSONSchema7;
}

// Zod schemas derived from the canonical field definitions above
export const ToolCommandSchema = z
  .object({
    reason: z.string().default(''),
    shell: z.string(),
    run: z.string(),
    cwd: z.string().default(''),
    timeout_sec: z.number().int().min(1).default(60),
    filter_regex: z.string().default(''),
    tail_lines: z.number().int().min(0).default(DEFAULT_COMMAND_TAIL_LINES),
    max_bytes: z.number().int().min(1).default(DEFAULT_COMMAND_MAX_BYTES),
  })
  .strict();

const ToolObservationSchema = z
  .object({
    observation_for_llm: z.record(z.string(), z.unknown()).nullable().optional(),
    observation_metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .strict();

export const ToolPlanStepSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    status: z.enum(['pending', 'completed', 'failed', 'abandoned']),
    waitingForId: z.array(z.string()).default([]),
    command: ToolCommandSchema,
    observation: ToolObservationSchema.optional(),
  })
  .strict();

export const ToolResponseSchema = z
  .object({
    message: z.string(),
    plan: z.array(ToolPlanStepSchema),
  })
  .strict();

export type ToolCommand = z.infer<typeof ToolCommandSchema>;
export type ToolPlanStep = z.infer<typeof ToolPlanStepSchema>;
export type ToolResponse = z.infer<typeof ToolResponseSchema>;

export interface CommandRequestLimits {
  timeoutSec: number | null;
  filterRegex: string;
  tailLines: number;
  maxBytes: number;
}

export interface CommandRequest {
  reason: string;
  shell?: string;
  run: string;
  cwd: string;
  limits: CommandRequestLimits;
}

// JSON Schema (AJV + provider wrapper) and named tool definition
export const ToolResponseJsonSchema = createToolResponseJsonSchema('provider');

export const RuntimeToolResponseJsonSchema = createToolResponseJsonSchema('runtime');

export const ToolDefinition = Object.freeze({
  name: 'open-agent',
  description:
    'Return the response envelope that matches the OpenAgent protocol (message, plan, and command fields).',
  schema: asJsonSchema<ToolResponse>(() => ToolResponseJsonSchema),
});

// ------------------------------------------------
// AI SDK response union + call options/client types
// ------------------------------------------------
export type ToolResponseStreamPartial = DeepPartial<ToolResponse>;

export type ResponseCallOptions = {
  signal?: AbortSignal;
  maxRetries?: number;
};

export type ResponsesProvider = (model: string) => LanguageModel;

export type ResponsesFunction = ResponsesProvider & {
  responses?: ResponsesProvider;
};

export type ResponsesClient = { responses: ResponsesProvider } | ResponsesFunction;

export type AiResponseFunctionCall = {
  type: 'function_call';
  name: string;
  arguments: string;
  call_id: string | null;
};
export type AiResponseMessageContent = { type: 'output_text'; text: string };
export type AiResponseMessage = {
  type: 'message';
  role: 'assistant';
  content: AiResponseMessageContent[];
};
export type AiResponseOutput = AiResponseFunctionCall | AiResponseMessage;
export type StructuredModelResponse = {
  output_text: string;
  output: AiResponseOutput[];
  structured: GenerateObjectResult<ToolResponse>;
};
export type TextModelResponse = {
  output_text: string;
  output: AiResponseOutput[];
  text: GenerateTextResult<ToolSet, string>;
};
export type CreateResponseResult = StructuredModelResponse | TextModelResponse;

export type ModelResponse = CreateResponseResult;
export type AiCallOptions = ResponseCallOptions;
export type AiClient = ResponsesClient;

// ----------------------------------

// Requests (runtime -> AI SDK client)
// ----------------------------------
export { buildOpenAgentRequestPayload as buildModelRequest } from '../agent/modelRequestPayload.js';
export type {
  OpenAgentRequestPayload as ModelRequest,
  BuildOpenAgentRequestPayloadOptions as ModelRequestBuildOptions,
} from '../agent/modelRequestPayload.js';

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
export async function requestModelCompletion(
  options: import('../agent/modelRequest.js').RequestModelCompletionOptions,
) {
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

// Normalized tool call DTO returned by extractOpenAgentToolCall
export type ToolCall = {
  name: 'open-agent';
  call_id: string | null;
  arguments: string;
};

// Provider-specific options type for OpenAI (for consumers that build their own calls)
export type { OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
