import { jsonSchema as asJsonSchema } from '@ai-sdk/provider-utils';
import type { JSONSchema7 } from '@ai-sdk/provider';

import { DEFAULT_COMMAND_MAX_BYTES, DEFAULT_COMMAND_TAIL_LINES } from '../constants.js';
import type { PlanResponse } from './plan.js';

/**
 * API FROZEN: DO NOT CHANGE
 * Stable JSON Schema that defines the OpenAgent tool response contract consumed by the AI SDK.
 * Coordinate any modifications via a versioned migration and major release.
 */
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

/**
 * API FROZEN: DO NOT CHANGE
 * Canonical tool definition wired into AI SDK requests. This schema is the single
 * source of truth for structured responses from the model.
 */
export const ToolDefinition = Object.freeze({
  name: 'open-agent',
  description:
    'Return the response envelope that matches the OpenAgent protocol (message, plan, and command fields).',
  schema: asJsonSchema<PlanResponse>(() => PlanResponseJsonSchema),
});

/**
 * API FROZEN: DO NOT CHANGE
 * Runtime variant used by the executor when validating assistant plan payloads.
 * Kept in lockstep with PlanResponseJsonSchema; evolve only via coordinated changes.
 */
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
