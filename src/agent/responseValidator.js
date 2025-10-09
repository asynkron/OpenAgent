import Ajv from 'ajv';

import { RESPONSE_PARAMETERS_SCHEMA } from './responseToolSchema.js';

/**
 * Validates assistant JSON responses to ensure they follow the required protocol.
 * The validator returns a list of human-readable errors instead of throwing so the
 * caller can surface structured feedback back to the LLM.
 */

const ALLOWED_STATUSES = new Set(['pending', 'running', 'completed']);
const PLAN_CHILD_KEYS = ['substeps'];

const ajv = new Ajv({ allErrors: true, strict: false });
const validateResponseSchema = ajv.compile(RESPONSE_PARAMETERS_SCHEMA);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeStatus(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().toLowerCase();
}

function validatePlanItem(item, path, state, errors) {
  if (!isPlainObject(item)) {
    errors.push(`${path} must be an object.`);
    return;
  }

  const stepLabel =
    typeof item.step === 'string' ? item.step.trim() : String(item.step ?? '').trim();
  if (!stepLabel) {
    errors.push(`${path} is missing a non-empty "step" label.`);
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

  if (!state.firstOpenStatus && normalizedStatus !== 'completed') {
    state.firstOpenStatus = normalizedStatus;
  }

  if (normalizedStatus !== 'completed') {
    state.hasOpenSteps = true;
  }

  for (const key of PLAN_CHILD_KEYS) {
    const children = item[key];
    if (typeof children === 'undefined') {
      continue;
    }

    if (!Array.isArray(children)) {
      errors.push(`${path}.${key} must be an array when present.`);
      continue;
    }

    children.forEach((child, index) => {
      validatePlanItem(child, `${path}.${key}[${index}]`, state, errors);
    });
  }
}

function formatSchemaErrors(errors = []) {
  const messages = [];
  const seen = new Set();
  let missingRun = false;
  let missingRead = false;
  let commandVariantIssue = undefined;

  for (const error of errors) {
    const path = error.instancePath || '';
    const keyword = error.keyword;

    if (path === '/command' && keyword === 'type' && error.params?.type === 'null') {
      // Ignore the null-branch failure when the object variant is being validated.
      continue;
    }

    if (path === '/command' && keyword === 'required') {
      const missingProperty = error.params?.missingProperty;
      if (missingProperty === 'read') {
        missingRead = true;
      } else if (missingProperty === 'run') {
        missingRun = true;
      }
      continue;
    }

    if (path === '/command' && keyword === 'oneOf') {
      commandVariantIssue = Array.isArray(error.params?.passingSchemas)
        ? { type: 'both', passing: error.params.passingSchemas }
        : { type: 'neither' };
      continue;
    }

    if (path === '/command' && keyword === 'additionalProperties') {
      const prop = error.params?.additionalProperty;
      if (prop) {
        const message = `Command includes unsupported property "${prop}".`;
        if (!seen.has(message)) {
          messages.push(message);
          seen.add(message);
        }
        continue;
      }
    }

    if (path === '/command' && keyword === 'anyOf') {
      // Allow specific messaging to handle execute vs. read variant errors.
      continue;
    }

    if (path === '/plan' && keyword === 'maxItems') {
      const message = 'Plan must not contain more than 3 top-level steps.';
      if (!seen.has(message)) {
        messages.push(message);
        seen.add(message);
      }
      continue;
    }

    if (!path && keyword === 'required') {
      const missingProperty = error.params?.missingProperty;
      if (missingProperty) {
        const message = `Assistant response is missing required field "${missingProperty}".`;
        if (!seen.has(message)) {
          messages.push(message);
          seen.add(message);
        }
        continue;
      }
    }

    const location = path || 'root';
    const message = `Schema validation failed at ${location}: ${error.message}.`;
    if (!seen.has(message)) {
      messages.push(message);
      seen.add(message);
    }
  }

  if (missingRun && !seen.has('Command objects must include a non-empty string "run".')) {
    messages.push('Command objects must include a non-empty string "run".');
    seen.add('Command objects must include a non-empty string "run".');
  }

  if (missingRead && !seen.has('Command objects must include a "read" specification.')) {
    messages.push('Command objects must include a "read" specification.');
    seen.add('Command objects must include a "read" specification.');
  }

  if (commandVariantIssue) {
    const message =
      commandVariantIssue.type === 'both'
        ? 'Read commands must not include "run" or "shell" fields.'
        : 'Command must choose either execute or read variants.';
    if (!seen.has(message)) {
      messages.push(message);
      seen.add(message);
    }
  }

  return messages;
}

export function validateAssistantResponse(payload) {
  if (!isPlainObject(payload)) {
    return {
      valid: false,
      errors: ['Assistant response must be a JSON object.'],
    };
  }

  const schemaValid = validateResponseSchema(payload);
  if (!schemaValid) {
    return {
      valid: false,
      errors: formatSchemaErrors(validateResponseSchema.errors),
    };
  }

  const errors = [];

  const plan = Array.isArray(payload.plan) ? payload.plan : [];
  const command = payload.command ?? null;

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

    if (state.hasOpenSteps) {
      if (state.firstOpenStatus !== 'running') {
        errors.push('The next pending plan step must be marked as "running".');
      }

      if (state.runningCount === 0) {
        errors.push('At least one plan step must have status "running" when a plan is active.');
      }

      if (command === null) {
        errors.push('Active plans require a "command" to execute next.');
      }
    }
  }

  if (!command) {
    return {
      valid: errors.length === 0,
      errors,
    };
  }

  const hasReadSpec = Object.prototype.hasOwnProperty.call(command, 'read');
  const runValue = typeof command.run === 'string' ? command.run : '';
  const shellValue = typeof command.shell === 'string' ? command.shell : '';
  const cwdValue = typeof command.cwd === 'string' ? command.cwd : '';

  const trimmedRun = runValue.trim();
  const trimmedShell = shellValue.trim();
  const trimmedCwd = cwdValue.trim();

  if (!hasReadSpec) {
    if (!trimmedRun) {
      errors.push('Command objects must include a non-empty string "run".');
    }

    if (Object.prototype.hasOwnProperty.call(command, 'shell') && !trimmedShell) {
      errors.push('When provided, "shell" must be a non-empty string.');
    }
  } else {
    if (command.read !== undefined && !isPlainObject(command.read)) {
      errors.push('"command.read" must be an object when provided.');
    }

    if (trimmedRun || trimmedShell) {
      errors.push('Read commands must not include "run" or "shell" fields.');
    }
  }

  if (Object.prototype.hasOwnProperty.call(command, 'cwd') && !trimmedCwd) {
    errors.push('When provided, "cwd" must be a non-empty string.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export default {
  validateAssistantResponse,
};
