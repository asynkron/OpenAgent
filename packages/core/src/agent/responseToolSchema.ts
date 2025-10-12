// @ts-nocheck
/**
 * JSON schema describing the OpenAgent tool payload.
 *
 * Responsibilities:
 * - Freeze the schema so runtime consumers cannot mutate it at runtime.
 * - Export the tool descriptor used when calling the OpenAI Responses API.
 *
 * Note: The runtime still imports the compiled `responseToolSchema.js`; run `tsc`
 * to regenerate it after editing this source until the build pipeline emits from
 * TypeScript directly.
 */
export type JsonSchema = Record<string, unknown>;

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);
  for (const nestedValue of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nestedValue);
  }

  return value;
}

export const RESPONSE_PARAMETERS_SCHEMA: JsonSchema = {
  type: 'object',
  description: `Example payload:
  {
    message: "Executing the requested command.",
    plan: [
      //task
      {
        id: "unique-id",
        description: "Run the user-requested shell command to print a greeting.",
        status: "pending",
        priority: 1,
        //optional, AI can decide if this task must wait for other tasks to complete first
        waitingForId: ["this-id-must-complete-first", "and-this-id-too"],
        command: {
            reason: "Run the user-requested shell command to print a greeting.",
            shell: "/bin/bash",
            run: "some command that helps progress to the end goal.. never do noop operations such as echo",
            cwd: "/Users/rogerjohansson/git/asynkron/OpenAgent",
            timeout_sec: 30
          }
      },
      {
        id: "this-id-must-complete-first",
        description: "Do something...",

        ...
      }
    ],
  }
  `,
  additionalProperties: false,
  required: ['message', 'plan'],
  properties: {
    message: {
      type: 'string',
      description: 'Markdown formatted message to the user',
    },
    plan: {
      type: 'array',
      description: "List of steps representing the assistant's current plan.",
      items: {
        type: 'object',
        description: 'Represents a single plan step.',
        required: ['id', 'title', 'status', 'command'],
        additionalProperties: false,
        properties: {
          id: {
            type: 'string',
            description: 'Random ID assigned by AI.',
          },
          title: { type: 'string' },
          status: {
            type: 'string',
            enum: ['pending', 'completed', 'failed', 'abandoned'],
            description: '',
          },
          age: {
            type: 'integer',
            minimum: 0,
            default: 0,
            description:
              'Number of assistant responses observed while this step has been running; increments once per response when status remains running.',
          },
          waitingForId: {
            type: 'array',
            description: 'IDs this task has to wait for before it can be executed (dependencies).',
            items: { type: 'string' },
          },
          command: {
            type: 'object',
            required: ['shell', 'run'],
            description:
              'MUST be on an element of the plan array. Next tool invocation to execute for this plan step. This command should complete the task if successful. Must NOT be a raw string (e.g. command: "ls"). Must follow this format: {"shell":"/bin/bash","run":"ls -la","cwd":"/home/user","timeout_sec":30,"filter_regex":".*\\.txt$","tail_lines":10}',
            additionalProperties: false,
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
          },
        },
      },
    },
  },
};

deepFreeze(RESPONSE_PARAMETERS_SCHEMA);

export const OPENAGENT_RESPONSE_TOOL = deepFreeze({
  type: 'function',
  name: 'open-agent',
  description:
    'Return the response envelope that matches the OpenAgent protocol (message, plan, and command fields).',
  parameters: RESPONSE_PARAMETERS_SCHEMA,
});

export default OPENAGENT_RESPONSE_TOOL;
