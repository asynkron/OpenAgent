import type { PlanStep } from './planExecution.js';

export type StepIdentifier = string;

export const normalizePlanIdentifier = (
  value: string | number | null | undefined,
): StepIdentifier | null => {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return null;
  }

  const normalized = String(value).trim();
  return normalized ? normalized : null;
};

export const extractPlanStepIdentifier = (
  step: PlanStep | null | undefined,
): StepIdentifier | null => {
  if (!step) {
    return null;
  }

  const id = normalizePlanIdentifier(step.id);
  if (id) {
    return id;
  }

  return normalizePlanIdentifier(step.step ?? null);
};
