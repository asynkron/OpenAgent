/**
 * Validates assistant JSON responses to ensure they follow the required protocol.
 * The validator returns a list of human-readable errors instead of throwing so the
 * caller can surface structured feedback back to the LLM.
 */

const ALLOWED_STATUSES = new Set(['pending', 'running', 'completed']);
const PLAN_CHILD_KEYS = ['substeps'];

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

  const stepLabel = typeof item.step === 'string' ? item.step.trim() : String(item.step ?? '').trim();
  if (!stepLabel) {
    errors.push(`${path} is missing a non-empty "step" label.`);
  }

  if (typeof item.title !== 'string' || !item.title.trim()) {
    errors.push(`${path} is missing a non-empty "title".`);
  }

  const normalizedStatus = normalizeStatus(item.status);
  if (!ALLOWED_STATUSES.has(normalizedStatus)) {
    errors.push(`${path} has invalid status "${item.status}". Expected pending, running, or completed.`);
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

export function validateAssistantResponse(payload) {
  const errors = [];

  if (!isPlainObject(payload)) {
    return {
      valid: false,
      errors: ['Assistant response must be a JSON object.'],
    };
  }

  if (typeof payload.message !== 'undefined' && typeof payload.message !== 'string') {
    errors.push('"message" must be a string when provided.');
  }

  const plan = Array.isArray(payload.plan) ? payload.plan : payload.plan === undefined ? [] : null;
  if (plan === null) {
    errors.push('"plan" must be an array.');
  }

  const command = payload.command ?? null;
  if (command !== null && !isPlainObject(command)) {
    errors.push('"command" must be null or an object.');
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

