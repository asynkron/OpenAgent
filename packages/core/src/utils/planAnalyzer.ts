import type { PlanItem, PlanTree } from './planCloneUtils.js';
import { clonePlanTree } from './planCloneUtils.js';
import { isCompletedStatus, isTerminalStatus } from './planStatusUtils.js';

const normalizePlanIdentifier = (value: string | number | null | undefined): string => {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return '';
  }
  return String(value).trim() || '';
};

export const buildPlanLookup = (plan: PlanTree | null | undefined): Map<string, PlanItem> => {
  const lookup = new Map<string, PlanItem>();

  if (!Array.isArray(plan)) {
    return lookup;
  }

  plan.forEach((item, index) => {
    const id = normalizePlanIdentifier(item.id) || `index:${index}`;
    if (!lookup.has(id)) {
      lookup.set(id, item);
    }
  });

  return lookup;
};

export const planStepIsBlocked = (
  step: PlanItem | null | undefined,
  planOrLookup: PlanTree | Map<string, PlanItem> | null | undefined,
): boolean => {
  if (!step) {
    return false;
  }

  const dependencies = Array.isArray(step.waitingForId) ? step.waitingForId : [];
  if (dependencies.length === 0) {
    return false;
  }

  const lookup =
    planOrLookup instanceof Map
      ? planOrLookup
      : Array.isArray(planOrLookup)
        ? buildPlanLookup(planOrLookup)
        : new Map<string, PlanItem>();

  if (lookup.size === 0) {
    return true;
  }

  for (const rawId of dependencies) {
    const dependencyId = normalizePlanIdentifier(rawId);
    if (!dependencyId) {
      return true;
    }

    const dependency = lookup.get(dependencyId);
    if (!dependency || !isCompletedStatus(dependency.status)) {
      return true;
    }
  }

  return false;
};

export const planHasOpenSteps = (plan: PlanTree | null | undefined): boolean => {
  if (!Array.isArray(plan) || plan.length === 0) {
    return false;
  }

  return plan.some((item) => {
    return !isTerminalStatus(item.status);
  });
};

export interface PlanProgress {
  completedSteps: number;
  remainingSteps: number;
  totalSteps: number;
  ratio: number;
}

const aggregateProgress = (items: readonly PlanItem[]): { completed: number; total: number } => {
  let completed = 0;
  let total = 0;

  if (!Array.isArray(items) || items.length === 0) {
    return { completed, total };
  }

  for (const item of items) {
    total += 1;
    if (isTerminalStatus(item.status)) {
      completed += 1;
    }
  }

  return { completed, total };
};

export const computePlanProgress = (plan: PlanTree | null | undefined): PlanProgress => {
  const sanitized = Array.isArray(plan) ? plan : clonePlanTree(plan ?? []);
  const { completed, total } = aggregateProgress(sanitized);
  const ratio = total > 0 ? Math.min(1, Math.max(0, completed / total)) : 0;
  const remaining = Math.max(0, total - completed);

  return {
    completedSteps: completed,
    remainingSteps: remaining,
    totalSteps: total,
    ratio,
  };
};
