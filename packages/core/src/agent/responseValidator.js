import Ajv from 'ajv';
import { RESPONSE_PARAMETERS_SCHEMA } from './responseToolSchema.js';

/**
 * Validates assistant JSON responses to ensure they follow the required protocol.
 * The validator returns a list of human-readable errors instead of throwing so the
 * caller can surface structured feedback back to the LLM.
 */

const ajv = new Ajv({ allErrors: true, strict: false });
const schemaValidator = ajv.compile(RESPONSE_PARAMETERS_SCHEMA);

function decodePointerSegment(segment) {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}

function formatInstancePath(instancePath) {
  if (!instancePath) {
    return 'response';
  }

  const segments = instancePath
    .split('/')
    .filter(Boolean)
    .map((segment) => decodePointerSegment(segment));

  let pathLabel = 'response';
  for (const segment of segments) {
    if (/^\d+$/.test(segment)) {
      pathLabel += `[${segment}]`;
    } else if (/^[A-Za-z_$][\w$]*$/.test(segment)) {
      pathLabel += `.${segment}`;
    } else {
      pathLabel += `['${segment}']`;
    }
  }

  return pathLabel;
}

function buildSchemaErrorMessage(error) {
  if (!error) {
    return 'Schema validation failed.';
  }

  if (error.keyword === 'required' && typeof error.params?.missingProperty === 'string') {
    return `Missing required property "${error.params.missingProperty}".`;
  }

  if (
    error.keyword === 'additionalProperties' &&
    typeof error.params?.additionalProperty === 'string'
  ) {
    return `Unexpected property "${error.params.additionalProperty}".`;
  }

  if (error.keyword === 'enum' && Array.isArray(error.params?.allowedValues)) {
    return `Must be one of: ${error.params.allowedValues.join(', ')}.`;
  }

  if (error.keyword === 'type' && typeof error.params?.type === 'string') {
    return `Must be of type ${error.params.type}.`;
  }

  const message = typeof error.message === 'string' ? error.message : 'failed validation.';
  return message.trim();
}

function describeSchemaError(error) {
  const pathLabel = formatInstancePath(error?.instancePath ?? '');
  return {
    path: pathLabel,
    message: buildSchemaErrorMessage(error),
    keyword: error?.keyword ?? 'unknown',
    instancePath: error?.instancePath ?? '',
    params: error?.params ?? {},
  };
}

export function validateAssistantResponseSchema(payload) {
  const valid = schemaValidator(payload);

  if (valid) {
    return { valid: true, errors: [] };
  }

  const errors = Array.isArray(schemaValidator.errors)
    ? schemaValidator.errors.map((error) => describeSchemaError(error))
    : [
        {
          path: 'response',
          message: 'Schema validation failed for assistant response.',
          keyword: 'unknown',
          instancePath: '',
          params: {},
        },
      ];

  return {
    valid: false,
    errors,
  };
}

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'abandoned']);
const ALLOWED_STATUSES = new Set(['pending', 'running', 'completed', 'failed', 'abandoned']);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeStatus(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().toLowerCase();
}

function hasExecutableCommand(command) {
  if (!isPlainObject(command)) {
    return false;
  }

  const run = typeof command.run === 'string' ? command.run.trim() : '';
  const shell = typeof command.shell === 'string' ? command.shell.trim() : '';

  return Boolean(run || shell);
}

function validatePlanItem(item, path, state, errors) {
  if (!isPlainObject(item)) {
    errors.push(`${path} must be an object.`);
    return;
  }

  const idLabel = typeof item.id === 'string' ? item.id.trim() : '';
  const stepLabel = typeof item.step === 'string' ? item.step.trim() : '';
  if (!idLabel && !stepLabel) {
    errors.push(`${path} is missing a non-empty "step" or "id" label.`);
  }

  if (typeof item.title !== 'string' || !item.title.trim()) {
    errors.push(`${path} is missing a non-empty "title".`);
  }

  const normalizedStatus = normalizeStatus(item.status);

  if (!normalizedStatus) {
    errors.push(`${path} is missing a valid "status".`);
  } else if (!ALLOWED_STATUSES.has(normalizedStatus)) {
    errors.push(
      `${path}.status must be one of: ${Array.from(ALLOWED_STATUSES).join(', ')}.`,
    );
  }

  if (normalizedStatus === 'running') {
    state.runningCount += 1;
  }

  if (!state.firstOpenStatus && normalizedStatus !== 'completed') {
    state.firstOpenStatus = normalizedStatus;
  }

  const command = item.command;

  if (typeof command !== 'undefined' && command !== null && !isPlainObject(command)) {
    errors.push(`${path}.command must be an object when present.`);
  }

  const commandHasPayload = hasExecutableCommand(command);

  if (!TERMINAL_STATUSES.has(normalizedStatus)) {
    state.hasOpenSteps = true;
    if (!state.firstOpenStatus) {
      state.firstOpenStatus = normalizedStatus;
    }
    if (!commandHasPayload) {
      errors.push(
        `${path} requires a non-empty command while the step is ${normalizedStatus || 'active'}.`,
      );
    }
  } else if (command && !commandHasPayload && isPlainObject(command)) {
    errors.push(`${path}.command must include execution details when provided.`);
  }
}

export function validateAssistantResponse(payload) {
  const errors = [];

  if (!isPlainObject(payload)) {
    return {
      valid: false,
      errors: ['Assistant response must be a JSON object.'],
    };
  }

  if (
    typeof payload.message !== 'undefined' &&
    payload.message !== null &&
    typeof payload.message !== 'string'
  ) {
    errors.push('"message" must be a string when provided.');
  }

  const plan = Array.isArray(payload.plan) ? payload.plan : payload.plan === undefined ? [] : null;
  if (plan === null) {
    errors.push('"plan" must be an array.');
  }

  if (Array.isArray(plan)) {
    if (plan.length > 3) {
      errors.push('Plan must not contain more than 3 top-level steps.');
    }

    const state = {
      runningCount: 0,
      firstOpenStatus: '',
      hasOpenSteps: false,
    };

    plan.forEach((item, index) => {
      validatePlanItem(item, `plan[${index}]`, state, errors);
    });

    if (state.hasOpenSteps && state.firstOpenStatus && state.firstOpenStatus !== 'running') {
      errors.push('The next pending plan step must be marked as "running".');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export default {
  validateAssistantResponseSchema,
  validateAssistantResponse,
};
