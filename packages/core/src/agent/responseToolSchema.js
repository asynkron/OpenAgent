function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);
  for (const nestedValue of Object.values(value)) {
    deepFreeze(nestedValue);
  }

  return value;
}

export const RESPONSE_PARAMETERS_SCHEMA = {
  type: 'object',
  description: `Example payload:
  {
    message: "Executing the requested command.",
    plan: [
      {
        step: "1",
        title: "Run the user-requested shell command to print a greeting.",
        status: "running",
        command: {
          run: "echo hello",
          cwd: ".",
          timeout_sec: 30
        }
      }
    ],
  }
  `,
  additionalProperties: false,
  required: ['message', 'plan'],
  properties: {
    message: {
      type: ['string', 'null'],
      description: 'Markdown formatted message to the user',
    },
    plan: {
      type: 'array',
      description: "List of steps representing the assistant's current plan.",
      items: {
        type: 'object',
        description: 'Represents a single plan step.',
        required: ['step', 'title', 'status'],
        additionalProperties: false,
        properties: {
          step: {
            type: 'string',
            description: 'Stable identifier used to refer to this plan step.',
          },
          id: {
            type: 'string',
            description: 'Optional legacy identifier carried over from previous responses.',
          },
          title: { type: 'string' },
          description: {
            type: 'string',
            description: 'Optional human-readable description of the step.',
          },
          status: {
            type: 'string',
            enum: ['pending', 'running', 'completed', 'failed', 'abandoned'],
            description: 'Lifecycle status for the plan step.',
          },
          priority: {
            anyOf: [
              { type: 'integer' },
              { type: 'number' },
              { type: 'string' },
            ],
            description: 'Optional priority indicator used to order execution.',
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
            description:
              'Optional command describing the next action required to progress this plan step. Must not be an empty string.',
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
