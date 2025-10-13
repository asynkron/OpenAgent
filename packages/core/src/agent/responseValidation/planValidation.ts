/**
 * Semantic validators for plan steps and top-level assistant responses.
 * The helpers live outside the main export so individual checks remain testable.
 */
import type { AssistantResponseValidationResult, PlanValidationState } from './types.js';

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'abandoned']);
const ALLOWED_STATUSES = new Set(['pending', 'completed', 'failed', 'abandoned']);

type CommandPayload = Record<string, unknown> & {
  run?: unknown;
  shell?: unknown;
};

type PlanItem = Record<string, unknown> & {
  id?: unknown;
  step?: unknown;
  title?: unknown;
  status?: unknown;
  command?: unknown;
};

type AssistantResponsePayload = Record<string, unknown> & {
  message?: unknown;
  plan?: unknown;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeStatus(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().toLowerCase();
}

function hasExecutableCommand(command: unknown): command is CommandPayload {
  if (!isPlainObject(command)) {
    return false;
  }

  const run = typeof command.run === 'string' ? command.run.trim() : '';
  const shell = typeof command.shell === 'string' ? command.shell.trim() : '';

  return Boolean(run || shell);
}

function validatePlanItem(item: unknown, path: string, state: PlanValidationState, errors: string[]): void {
  if (!isPlainObject(item)) {
    errors.push(`${path} must be an object.`);
    return;
  }

  const candidate = item as PlanItem;
  const idLabel = typeof candidate.id === 'string' ? candidate.id.trim() : '';
  const stepLabel = typeof candidate.step === 'string' ? candidate.step.trim() : '';
  if (!idLabel) {
    const hint = stepLabel ? ' Provide an "id" value instead of "step" to satisfy the schema.' : '';
    errors.push(`${path} is missing a non-empty "id" label.${hint}`.trim());
  }

  if (typeof candidate.title !== 'string' || !candidate.title.trim()) {
    errors.push(`${path} is missing a non-empty "title".`);
  }

  const normalizedStatus = normalizeStatus(candidate.status);

  if (!normalizedStatus) {
    errors.push(`${path} is missing a valid "status".`);
  } else if (!ALLOWED_STATUSES.has(normalizedStatus)) {
    errors.push(`${path}.status must be one of: ${Array.from(ALLOWED_STATUSES).join(', ')}.`);
  }

  if (!state.firstOpenStatus && normalizedStatus !== 'completed') {
    state.firstOpenStatus = normalizedStatus;
  }

  const command = candidate.command;

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
      errors.push(`${path} requires a non-empty command while the step is ${normalizedStatus || 'active'}.`);
    }
  } else if (command && !commandHasPayload && isPlainObject(command)) {
    errors.push(`${path}.command must include execution details when provided.`);
  }
}

export function validateAssistantResponse(payload: unknown): AssistantResponseValidationResult {
  if (!isPlainObject(payload)) {
    return {
      valid: false,
      errors: ['Assistant response must be a JSON object.'],
    };
  }

  const candidate = payload as AssistantResponsePayload;
  const errors: string[] = [];

  if (typeof candidate.message !== 'undefined' && candidate.message !== null && typeof candidate.message !== 'string') {
    errors.push('"message" must be a string when provided.');
  }

  const plan = Array.isArray(candidate.plan) ? candidate.plan : candidate.plan === undefined ? [] : null;
  if (plan === null) {
    errors.push('"plan" must be an array.');
  }

  if (Array.isArray(plan)) {
    const state: PlanValidationState = {
      firstOpenStatus: '',
      hasOpenSteps: false,
    };

    plan.forEach((item, index) => {
      validatePlanItem(item, `plan[${index}]`, state, errors);
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
