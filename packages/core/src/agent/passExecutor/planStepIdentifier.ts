import type { PlanStep } from './planExecution.js';

export type StepIdentifier = string;

export const normalizePlanIdentifier = (value: unknown): StepIdentifier | null => {
  if (typeof value === 'string' || typeof value === 'number') {
    const normalized = String(value).trim();
    return normalized || null;
  }
  return null;
};

export const extractPlanStepIdentifier = (
  step: PlanStep | null | undefined,
): StepIdentifier | null => {
  if (!step || typeof step !== 'object') {
    return null;
  }

  const id = normalizePlanIdentifier(step.id);
  if (id) {
    return id;
  }

  const fallback = normalizePlanIdentifier((step as { step?: unknown }).step);
  return fallback;
};
