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

const ALLOWED_STATUSES = new Set(['pending', 'running', 'completed', 'failed', 'abandoned']);
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'abandoned']);

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

  const id = typeof item.id === 'string' ? item.id.trim() : '';
  if (!id) {
    errors.push(`${path} is missing a non-empty "id".`);
  } else if (state.ids.has(id)) {
    errors.push(`${path} reuses id "${id}" which already exists in the plan.`);
  } else {
    state.ids.set(id, { path, item });
  }

  if (typeof item.title !== 'string' || !item.title.trim()) {
    errors.push(`${path} is missing a non-empty "title".`);
  }

  const normalizedStatus = normalizeStatus(item.status);
  if (!ALLOWED_STATUSES.has(normalizedStatus)) {
    errors.push(
      `${path} has invalid status "${item.status}". Expected pending, running, or completed.`,
    );
  }

  if (normalizedStatus === 'running') {
    state.runningCount += 1;
  }

  const command = item.command;

  if (typeof command !== 'undefined' && command !== null && !isPlainObject(command)) {
    errors.push(`${path}.command must be an object when present.`);
  }

  const commandHasPayload = hasExecutableCommand(command);

  if (!TERMINAL_STATUSES.has(normalizedStatus)) {
    state.hasOpenSteps = true;
    if (!commandHasPayload) {
      errors.push(
        `${path} requires a non-empty command while the step is ${normalizedStatus || 'active'}.`,
      );
    }
  } else if (command && !commandHasPayload && isPlainObject(command)) {
    errors.push(`${path}.command must include execution details when provided.`);
  }

  const waitingFor = Array.isArray(item.waitingForId) ? item.waitingForId : null;
  if (waitingFor === null) {
    errors.push(`${path}.waitingForId must be an array.`);
  }

  const normalizedDependencies = [];
  if (Array.isArray(waitingFor)) {
    const seen = new Set();
    waitingFor.forEach((dependency, index) => {
      if (typeof dependency !== 'string') {
        errors.push(`${path}.waitingForId[${index}] must be a string.`);
        return;
      }

      const trimmed = dependency.trim();
      if (!trimmed) {
        errors.push(`${path}.waitingForId[${index}] must not be empty.`);
        return;
      }

      if (trimmed === id) {
        errors.push(`${path}.waitingForId[${index}] cannot reference the task itself.`);
        return;
      }

      if (seen.has(trimmed)) {
        return;
      }

      seen.add(trimmed);
      normalizedDependencies.push(trimmed);
    });
  }

  const priorityValue = Number.parseInt(item.priority, 10);
  if (!Number.isFinite(priorityValue)) {
    errors.push(`${path}.priority must be an integer.`);
  }

  state.steps.push({
    id,
    status: normalizedStatus,
    waitingForId: normalizedDependencies,
    path,
  });
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
    if (plan.length > 5) {
      errors.push('Plan must not contain more than 5 steps.');
    }

    const state = {
      hasOpenSteps: false,
      ids: new Map(),
      steps: [],
    };

    plan.forEach((item, index) => {
      validatePlanItem(item, `plan[${index}]`, state, errors);
    });

    const readySteps = [];

    state.steps.forEach((step) => {
      if (!step.id) {
        return;
      }

      const dependencies = step.waitingForId ?? [];
      let dependenciesComplete = true;

      dependencies.forEach((dependency) => {
        const dependencyRecord = state.ids.get(dependency);
        if (!dependencyRecord) {
          errors.push(
            `${step.path}.waitingForId references unknown id "${dependency}".`,
          );
          dependenciesComplete = false;
          return;
        }

        const dependencyStatus = normalizeStatus(dependencyRecord.item.status);
        if (!TERMINAL_STATUSES.has(dependencyStatus)) {
          dependenciesComplete = false;
        }
      });

      if (!dependenciesComplete && step.status === 'running') {
        errors.push(`${step.path} cannot be running while dependencies remain incomplete.`);
      }

      if (dependenciesComplete && !TERMINAL_STATUSES.has(step.status)) {
        readySteps.push(step);
      }
    });

    if (state.hasOpenSteps && readySteps.length > 0) {
      const readyRunning = readySteps.some((step) => step.status === 'running');
      if (!readyRunning) {
        errors.push('At least one runnable plan step must be marked as "running".');
      }
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
