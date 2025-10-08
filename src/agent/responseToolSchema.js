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
      description: 'Markdown-capable summary of the current task status.',
    },
    plan: {
      type: 'array',
      maxItems: 3,
      items: { $ref: '#/$defs/planStep' },
      description: 'Progress tracker for multi-step work; omit or use [] when idle.',
    },
    command: {
      type: 'object',
      additionalProperties: false,
      properties: {
        description: {
          type: 'string',
          description: 'Human-friendly summary of why the command is needed.',
        },
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
        read: {
          $ref: '#/$defs/readCommand',
        },
      },
      oneOf: [
        { required: ['shell', 'run', 'cwd'] },
        { required: ['read'] },
      ],
      description: 'Next tool invocation to execute when a plan step is running.',
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
          description: 'Identifier for the plan step (e.g., "1", "1.1").',
        },
        title: {
          type: 'string',
          description: 'Short explanation of the plan step.',
        },
        status: {
          type: 'string',
          enum: ['pending', 'running', 'completed'],
          description: 'Current state of the plan step.',
        },
        substeps: {
          type: 'array',
          items: { $ref: '#/$defs/planStep' },
          description: 'Optional nested steps that follow the same contract.',
        },
      },
    },
    readCommand: {
      type: 'object',
      required: ['path'],
      additionalProperties: false,
      properties: {
        path: {
          type: 'string',
          description: 'Primary file path to read from disk.',
        },
        paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional batch of file paths to read.',
        },
        encoding: {
          type: 'string',
          description: 'Character encoding to use when reading files.',
        },
        max_bytes: {
          type: 'integer',
          minimum: 1,
          description: 'Optional byte limit for file reads.',
        },
        max_lines: {
          type: 'integer',
          minimum: 1,
          description: 'Optional line count limit for file reads.',
        },
      },
    },
  },
};

deepFreeze(RESPONSE_PARAMETERS_SCHEMA);

export const ASSISTANT_RESPONSE_TOOL = deepFreeze({
  type: 'function',
  function: {
    name: 'submit_assistant_response',
    description:
      'Return the response envelope that matches the OpenAgent protocol (message, plan, and command fields).',
    parameters: RESPONSE_PARAMETERS_SCHEMA,
  },
});

export default ASSISTANT_RESPONSE_TOOL;
