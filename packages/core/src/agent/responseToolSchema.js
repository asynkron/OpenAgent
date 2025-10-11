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
      maxItems: 3,
      items: { $ref: '#/$defs/planStep' },
      description:
        'You MUST provide a plan when have a set goal, NEVER drop/reset a plan without discussion, the plan stays on utill otherwise agreed upon, Progress tracker for multi-step work; use [] when resetting to a new plan.',
    },
  },
  $defs: {
    planStep: {
      type: 'object',
      required: ['step', 'title', 'status'],
      additionalProperties: false,
      properties: {
        step: {
          type: 'string',
          description: 'named after index in the plan. e.g. 1 or 2, or 1.1 for a sub task',
        },
        title: { type: 'string' },
        status: {
          type: 'string',
          enum: ['pending', 'running', 'completed', 'failed'],
          description:
            'once a command result has been received, decide if the task is complete or failed. a task that has a command result can never be pending or running',
        },
        substeps: {
          type: 'array',
          description:
            'if you can break down a task into smaller parts, do that. small progress is better than no progress',
          items: { $ref: '#/$defs/planStep' },
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
