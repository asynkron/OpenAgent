// @ts-nocheck
/**
 * Zod schema describing the OpenAgent structured response payload.
 *
 * Responsibilities:
 * - Encode the assistant response contract using the schema primitives supported by Vercel's AI SDK.
 * - Export the schema alongside a tool descriptor used when invoking structured generation helpers.
 *
 * Consumers:
 * - Agent pass executor during the thinking phase.
 * - History compactor when summarizing past conversation entries.
 */
import { z } from 'zod';

const commandSchema = z
  .object({
    reason: z
      .string()
      .describe(
        'Explain why this shell command is required for the plan step. If only shell or run is provided, justify the omission.',
      )
      .optional(),
    shell: z
      .string()
      .describe(
        'Shell executable to launch when running commands. May only contain value if "run" contains an actual command to run.',
      ),
    run: z
      .string()
      .describe(
        'Command string to execute in the provided shell. Must be set if "shell" has a value; may NOT be set if "shell" has no value.',
      ),
    cwd: z.string().describe('Working directory for shell execution.').optional(),
    timeout_sec: z
      .number()
      .int()
      .min(1)
      .describe('Optional timeout guard for long-running commands.')
      .optional(),
    filter_regex: z
      .string()
      .describe('Optional regex used to filter command output.')
      .optional(),
    tail_lines: z
      .number()
      .int()
      .min(1)
      .describe('Optional number of trailing lines to return from output.')
      .optional(),
  })
  .strict()
  .describe(
    'MUST be on an element of the plan array. Next tool invocation to execute for this plan step. This command should complete the task if successful.',
  );

const planStepSchema = z
  .object({
    id: z.string().describe('Random ID assigned by AI.'),
    title: z.string(),
    status: z
      .enum(['pending', 'completed', 'failed', 'abandoned'])
      .describe('Current execution status for the plan step.'),
    age: z
      .number()
      .int()
      .min(0)
      .describe(
        'Number of assistant responses observed while this step has been running; increments once per response when status remains running.',
      )
      .optional(),
    waitingForId: z
      .array(z.string())
      .describe('IDs this task has to wait for before it can be executed (dependencies).')
      .optional(),
    command: commandSchema,
    observation: z
      .record(z.unknown())
      .describe(
        'Latest command observation for this step, including stdout/stderr and metadata so the LLM can evaluate progress.',
      )
      .optional(),
  })
  .strict()
  .describe('Represents a single plan step.');

export const OPENAGENT_RESPONSE_SCHEMA = z
  .object({
    message: z.string().describe('Markdown formatted message to the user.'),
    plan: z
      .array(planStepSchema)
      .describe("List of steps representing the assistant's current plan."),
  })
  .strict()
  .describe('Return the response envelope that matches the OpenAgent protocol (message, plan, and command fields).');

export const OPENAGENT_RESPONSE_TOOL = Object.freeze({
  name: 'open-agent',
  description:
    'Return the response envelope that matches the OpenAgent protocol (message, plan, and command fields).',
  schema: OPENAGENT_RESPONSE_SCHEMA,
});

export const RESPONSE_PARAMETERS_SCHEMA = {
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
      description: "List of steps representing the assistant's current plan.",
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'title', 'status', 'command'],
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
            description: 'Current execution status for the plan step.',
          },
          age: {
            type: 'integer',
            minimum: 0,
            description:
              'Number of assistant responses observed while this step has been running; increments once per response when status remains running.',
          },
          waitingForId: {
            type: 'array',
            items: { type: 'string' },
            description: 'IDs this task has to wait for before it can be executed (dependencies).',
          },
          command: {
            type: 'object',
            additionalProperties: false,
            description:
              'Next tool invocation to execute for this plan step. This command should complete the task if successful.',
            required: ['shell', 'run'],
            properties: {
              reason: {
                type: 'string',
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
                description: 'Working directory for shell execution.',
              },
              timeout_sec: {
                type: 'integer',
                minimum: 1,
                description: 'Optional timeout guard for long-running commands.',
              },
              filter_regex: {
                type: 'string',
                description: 'Optional regex used to filter command output.',
              },
              tail_lines: {
                type: 'integer',
                minimum: 1,
                description: 'Optional number of trailing lines to return from output.',
              },
            },
          },
          observation: {
            type: 'object',
            description:
              'Latest command observation for this step, including stdout/stderr and metadata so the LLM can evaluate progress.',
            additionalProperties: true,
          },
        },
      },
    },
  },
};

export default OPENAGENT_RESPONSE_TOOL;
