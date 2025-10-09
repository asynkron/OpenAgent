import Ajv from 'ajv';

import { OPENAGENT_RESPONSE_TOOL } from './responseToolSchema.js';

/**
 * Validates assistant JSON responses to ensure they follow the required protocol.
 * The validator returns a list of human-readable errors instead of throwing so the
 * caller can surface structured feedback back to the LLM.
 */

const ajv = new Ajv({ allErrors: true, strict: false });
const STATUS_ENUM = [...OPENAGENT_RESPONSE_TOOL];

const PLAN_STEP_SCHEMA = {
  $id: 'PlanStep',
  type: 'object',
  required: ['step', 'title', 'status'],
  additionalProperties: false,
  properties: {
    step: { type: 'string' },
    title: { type: 'string' },
    status: { type: 'string', enum: STATUS_ENUM },
    substeps: {
      type: 'array',
      items: { $ref: 'PlanStep' },
    },
  },
};

ajv.addSchema(PLAN_STEP_SCHEMA);
const validatePlanStep = ajv.getSchema('PlanStep');

if (!validatePlanStep) {
  throw new Error('Failed to compile plan step schema for response validation.');
}

function formatAjvErrors(errors = [], prefix) {
  return errors
    .map((error) => {
      const location = error.instancePath ? `${prefix}${error.instancePath}` : prefix;
      return `${location} ${error.message}`.trim();
    })
    .filter(Boolean);
}

function analyzePlan(planValue, errors) {
  if (typeof planValue === 'undefined' || planValue === null) {
    return { hasOpenSteps: false, firstOpenStatus: '', runningCount: 0 };
  }

  if (!Array.isArray(planValue)) {
    errors.push('"plan" must be an array.');
    return { hasOpenSteps: false, firstOpenStatus: '', runningCount: 0 };
  }

  if (planValue.length > 3) {
    errors.push('Plan must not contain more than 3 top-level steps.');
  }

  const state = { hasOpenSteps: false, firstOpenStatus: '', runningCount: 0 };

  const visit = (items, path) => {
    items.forEach((item, index) => {
      const stepPath = `${path}[${index}]`;

      if (!validatePlanStep(item)) {
        errors.push(...formatAjvErrors(validatePlanStep.errors ?? [], stepPath));
        return;
      }

      const status = item.status.trim().toLowerCase();
      if (!state.firstOpenStatus && status !== 'completed') {
        state.firstOpenStatus = status;
      }
      if (status === 'running') {
        state.runningCount += 1;
      }
      if (status !== 'completed') {
        state.hasOpenSteps = true;
      }

      if (Array.isArray(item.substeps) && item.substeps.length > 0) {
        visit(item.substeps, `${stepPath}.substeps`);
      }
    });
  };

  visit(planValue, 'plan');
  return state;
}

export function validateAssistantResponse(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      valid: false,
      errors: ['Assistant response must be a JSON object.'],
    };
  }

  const errors = [];

  if (
    payload.message !== undefined &&
    payload.message !== null &&
    typeof payload.message !== 'string'
  ) {
    errors.push('"message" must be a string when provided.');
  }

  const command = payload.command ?? null;
  if (command !== null && (typeof command !== 'object' || Array.isArray(command))) {
    errors.push('"command" must be null or an object.');
  }

  const { hasOpenSteps, firstOpenStatus, runningCount } = analyzePlan(payload.plan, errors);

  if (hasOpenSteps) {
    if (firstOpenStatus !== 'running') {
      errors.push('The next pending plan step must be marked as "running".');
    }

    if (runningCount === 0) {
      errors.push('At least one plan step must have status "running" when a plan is active.');
    }

    if (!command) {
      errors.push('Active plans require a "command" to execute next.');
    }
  }

  if (command && Object.keys(command).length === 0) {
    errors.push('Command objects must include execution details.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export default {
  validateAssistantResponse,
};
