// Defines the function tool schema that mirrors the assistant response envelope
// described in prompts/system.md so the model can emit valid protocol JSON.

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
  additionalProperties: false,
  required: ['message'],
  properties: {
    message: {
      type: 'string',
      description: 'Markdown formatted message to the user',
    },
    plan: {
      type: 'array',
      maxItems: 5,
      items: { $ref: '#/$defs/planStep' },
      description: `This is a dependency-aware TODO list. Provide one flat array of steps where each item
lists the task IDs it must wait for. Steps without dependencies are immediately runnable. Sort by
priority so runnable work with lower numbers rises to the top. Use [] to clear the plan when starting
over.`,
    },
  },
  $defs: {
    planStep: {
      type: 'object',
      description:
        'Represents a single plan task with optional dependencies declared via waitingForId.',
      required: ['id', 'title', 'status', 'priority', 'waitingForId'],
      additionalProperties: false,
      properties: {
        id: {
          type: 'string',
          description: 'Stable identifier assigned by the AI. Must be unique within the plan.',
        },
        title: { type: 'string' },
        status: {
          type: 'string',
          enum: ['pending', 'running', 'completed', 'failed', 'abandoned'],
          description:
            'once a command result has been received, decide if the task is complete or failed. a task that has a command result can never be pending or running, AI can also use "abandoned" to delete items, they will be cleared once received by the agent',
        },
        priority: {
          type: 'integer',
          description: 'Lower numbers are executed first. Use consistent ordering across the plan.',
        },
        waitingForId: {
          type: 'array',
          description:
            'List of prerequisite task IDs that must reach completed status before this task can run. Use an empty array when the task is ready to execute.',
          items: { type: 'string' },
        },
        age: {
          type: 'integer',
          minimum: 0,
          default: 0,
          description:
            'Number of assistant responses observed while this step has been running; increments once per response when status remains running.',
        },
        command: {
          type: 'object',
          description:
            'Next tool invocation to execute for this plan step, this command should complete the task if successful. may NOT be raw string, e.g command: "ls". MUST follow this format: {"shell":"/bin/bash","run":"ls -la","cwd":"/home/user","timeout_sec":30,"filter_regex":".*\\.txt$","tail_lines":10}',
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
                'Shell executable to launch when running commands, may only contain value if "run" contains an actual command to run',
            },
            run: {
              type: 'string',
              description:
                'Command string to execute in the provided shell. must be set if "shell" has a value, may NOT be set if "shell" has no value',
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
