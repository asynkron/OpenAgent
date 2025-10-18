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
 * - PlanResponse / PlanStep / CommandDefinition — DTOs produced by the OpenAgent tool schema.
 * - OpenAgentObservation* — observation payloads we send back to the model.
 */

// -----------------------------
// Tool schema (Zod) and DTOs
// -----------------------------
import { jsonSchema as asJsonSchema } from '@ai-sdk/provider-utils';
import type { JSONSchema7 } from '@ai-sdk/provider';
import type { GenerateObjectResult, GenerateTextResult, ToolSet } from 'ai';
import { z } from 'zod';

import { PlanStatus, TERMINAL_PLAN_STATUSES } from './planStatus.js';
import type { CommandDefinition, CommandDraft, CommandExecutionDetails } from './command.js';
import type {
  PlanResponse,
  PlanObservation,
  PlanObservationMetadata,
  PlanObservationPayload,
  PlanStep,
} from './plan.js';
import type {
  ChatMessageContent,
  ChatMessageContentPart,
  ChatMessageEntry,
  ChatMessagePayload,
} from './history.js';
import { DEFAULT_COMMAND_MAX_BYTES, DEFAULT_COMMAND_TAIL_LINES } from '../constants.js';

const PlanObservationMetadataSchema: z.ZodType<PlanObservationMetadata | null | undefined> = z
  .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
  .nullable()
  .optional();

const PlanObservationPayloadSchema: z.ZodType<PlanObservationPayload> = z.lazy(() =>
  z
    .object({
      plan: z.array(z.lazy(() => PlanStepSchema)).optional(),
      stdout: z.string().optional(),
      stderr: z.string().optional(),
      truncated: z.boolean().optional(),
      exit_code: z.number().optional(),
      json_parse_error: z.boolean().optional(),
      schema_validation_error: z.boolean().optional(),
      response_validation_error: z.boolean().optional(),
      canceled_by_human: z.boolean().optional(),
      operation_canceled: z.boolean().optional(),
      summary: z.string().optional(),
      details: z.string().optional(),
    })
    .strict(),
);

const PlanObservationSchema: z.ZodType<PlanObservation> = z.lazy(() =>
  z
    .object({
      observation_for_llm: PlanObservationPayloadSchema.nullable().optional(),
      observation_metadata: PlanObservationMetadataSchema,
    })
    .strict(),
);

export { PlanStatus, TERMINAL_PLAN_STATUSES } from './planStatus.js';
export type { CommandDraft, CommandDefinition, CommandExecutionDetails } from './command.js';
export type {
  PlanResponse,
  PlanObservation,
  PlanObservationMetadata,
  PlanObservationPayload,
  PlanStep,
} from './plan.js';
export type {
  ChatMessageContent,
  ChatMessageContentPart,
  ChatMessageEntry,
  ChatMessagePayload,
} from './history.js';

// Zod schemas that mirror the interfaces above
export const CommandSchema = z
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

export const PlanStepSchema: z.ZodType<PlanStep> = z
  .object({
    id: z.string(),
    title: z.string(),
    status: z.nativeEnum(PlanStatus),
    waitingForId: z.array(z.string()).default([]),
    command: CommandSchema,
    observation: PlanObservationSchema.optional(),
  })
  .strict();

export const PlanResponseSchema = z
  .object({
    message: z.string(),
    plan: z.array(PlanStepSchema),
  })
  .strict();

// JSON Schema (AJV + provider wrapper) and named tool definition
export const PlanResponseJsonSchema = {
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
      description: `a DAG (Directed Acyclic Graph) of tasks to execute, 
      each task executes exactly 1 command, each task can depend 
      on 0 or more other tasks to complete before executing.
      User goals should be the last task to execute in the chain of task.
      e.g 'I want to create a guess a number game in js', then 'game created' is the end node in the graph.
      The DAG is designed to do groundwork first, creating files, install packages etc. and to validate, run tests etc as end nodes.      
      `,
      items: {
        type: 'object',
        description:
          'a single task in the DAG plan, represents both the task and the shell command to execute',
        additionalProperties: false,
        required: ['id', 'title', 'status', 'waitingForId', 'command'],
        properties: {
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
            enum: ['pending', 'completed', 'failed', 'abandoned'],
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
          command: {
            type: 'object',
            additionalProperties: false,
            description:
              'Next tool invocation to execute for this plan step. This command should complete the task if successful.',
            required: [
              'reason',
              'shell',
              'run',
              'cwd',
              'timeout_sec',
              'filter_regex',
              'tail_lines',
              'max_bytes',
            ],
            properties: {
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
                description:
                  'Number of trailing lines to return from output (0 disables the limit).',
              },
              max_bytes: {
                type: 'integer',
                minimum: 1,
                default: DEFAULT_COMMAND_MAX_BYTES,
                description: `Maximum number of bytes to include from stdout/stderr (defaults to ~${DEFAULT_COMMAND_TAIL_LINES} lines at ${DEFAULT_COMMAND_MAX_BYTES / 1024} KiB).`,
              },
            },
          },
        },
      },
    },
  },
} satisfies JSONSchema7;

export const ToolDefinition = Object.freeze({
  name: 'open-agent',
  description:
    'Return the response envelope that matches the OpenAgent protocol (message, plan, and command fields).',
  schema: asJsonSchema<PlanResponse>(() => PlanResponseJsonSchema),
});

// Runtime (AJV) validation schema — less strict than provider schema
export const RuntimePlanResponseJsonSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  additionalProperties: false,
  required: ['message', 'plan'],
  properties: {
    message: { type: 'string', description: 'Markdown formatted message to the user.' },
    plan: {
      type: 'array',
      description: "List of steps representing the assistant's current plan.",
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'title', 'status', 'command'],
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          status: { type: 'string', enum: ['pending', 'completed', 'failed', 'abandoned'] },
          age: { type: 'integer', minimum: 0 },
          waitingForId: { type: 'array', items: { type: 'string' } },
          command: {
            type: 'object',
            additionalProperties: false,
            description: 'Command to execute for this plan step.',
            required: ['shell', 'run', 'max_bytes'],
            properties: {
              reason: { type: 'string' },
              shell: { type: 'string' },
              run: { type: 'string' },
              cwd: { type: 'string' },
              timeout_sec: { type: 'integer', minimum: 1 },
              filter_regex: { type: 'string' },
              tail_lines: { type: 'integer', minimum: 0, default: DEFAULT_COMMAND_TAIL_LINES },
              max_bytes: { type: 'integer', minimum: 1, default: DEFAULT_COMMAND_MAX_BYTES },
            },
          },
          observation: { type: 'object', additionalProperties: true },
        },
      },
    },
  },
} satisfies JSONSchema7;

// ----------------------------------
// Requests (runtime -> AI SDK client)
// ----------------------------------
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

// Clarify the output shape union in SDK-agnostic terms (informational)
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
  structured: GenerateObjectResult<PlanResponse>;
};
export type TextModelResponse = {
  output_text: string;
  output: AiResponseOutput[];
  text: GenerateTextResult<ToolSet, string>;
};

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
  return mod.requestModelCompletion(options);
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
