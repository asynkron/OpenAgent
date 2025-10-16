import type { PlanStep, AssistantPayload } from './parserTypes.js';
import { isPlainObject } from './parserTypes.js';
import { normalizeCommandPayload } from './commandNormalizer.js';

const CHILD_KEY = 'substeps' as const;

const normalizePlanStep = (step: PlanStep): PlanStep => {
  if (!isPlainObject(step)) {
    return step;
  }

  const normalizedStep: PlanStep = { ...step };

  if ('command' in normalizedStep) {
    normalizedStep.command = normalizeCommandPayload(normalizedStep.command);
  }

  const candidate = Array.isArray(normalizedStep[CHILD_KEY])
    ? normalizedStep[CHILD_KEY]
    : Array.isArray(normalizedStep.children)
      ? normalizedStep.children
      : Array.isArray(normalizedStep.steps)
        ? normalizedStep.steps
        : null;

  if (candidate) {
    normalizedStep[CHILD_KEY] = candidate.map((child) => normalizePlanStep(child));
  } else if (CHILD_KEY in normalizedStep && !Array.isArray(normalizedStep[CHILD_KEY])) {
    delete normalizedStep[CHILD_KEY];
  }

  if ('children' in normalizedStep) {
    delete normalizedStep.children;
  }
  if ('steps' in normalizedStep) {
    delete normalizedStep.steps;
  }

  return normalizedStep;
};

export const normalizePlan = (plan: AssistantPayload['plan']): AssistantPayload['plan'] => {
  if (!Array.isArray(plan)) {
    return plan;
  }

  return plan.map((step) => normalizePlanStep(step));
};
