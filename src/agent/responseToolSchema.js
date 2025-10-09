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

const RESPONSE_PARAMETERS_SCHEMA = {
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
    command: {
      type: 'object',
      additionalProperties: false,
      properties: {
        run: { $ref: '#/$defs/runCommand' },
        read: { $ref: '#/$defs/readCommand' },
      },
      oneOf: [{ required: ['run'] }, { required: ['read'] }],
      description:
        'Next tool invocation to execute when a plan contains non-complete steps. may NOT be raw string, e.g command: "ls"',
    },
  },
  $defs: {
    planStep: {
      type: 'object',
      required: ['step', 'title', 'status'],
      additionalProperties: false,
      properties: {
        step: { type: 'string' },
        title: { type: 'string' },
        status: { type: 'string', enum: ['pending', 'running', 'completed'] },
        substeps: {
          type: 'array',
          items: { $ref: '#/$defs/planStep' },
        },
      },
    },
    readCommand: {
      type: 'object',
      required: ['path'],
      additionalProperties: false,
      properties: {
        path: { type: 'string' },
        paths: { type: 'array', items: { type: 'string' } },
        encoding: { type: 'string' },
        max_bytes: { type: 'integer', minimum: 1 },
        max_lines: { type: 'integer', minimum: 1 },
      },
    },
    runCommand: {
      type: 'object',
      description:
        'MUST follow this format: {"shell":"/bin/bash","run":"ls -la","cwd":"/home/user","timeout_sec":30,"filter_regex":".*\\.txt$","tail_lines":10}',
      required: ['shell', 'run', 'cwd'],
      additionalProperties: false,
      properties: {
        shell: {
          type: 'string',
          description: 'Shell executable to launch when running commands.',
        },
        run: {
          type: 'string',
          description: 'Command string to execute in the provided shell.',
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
