import type { PlanSnapshot, PlanSnapshotStep } from './planCloneUtils.js';
import { isCompletedStatus, isTerminalStatus } from './planStatusUtils.js';

type IdentifierCandidate =
  | PlanSnapshotStep['id']
  | (PlanSnapshotStep['waitingForId'] extends Array<infer U> ? U : never)
  | null
  | undefined;

function normalizePlanIdentifier(value: PlanSnapshotStep['id']): string;
function normalizePlanIdentifier(value: IdentifierCandidate): string;
function normalizePlanIdentifier(value: IdentifierCandidate): string {
  if (value === null || value === undefined) {
    return '';
  }

  const normalized = String(value).trim();
  return normalized || '';
}

export const buildPlanLookup = (plan: PlanSnapshot | null | undefined): Map<string, PlanSnapshotStep> => {
  const lookup = new Map<string, PlanSnapshotStep>();

  if (!Array.isArray(plan)) {
    return lookup;
  }

  plan.forEach((planItem, index) => {
    if (!planItem || typeof planItem !== 'object') {
      return;
    }

    const id = normalizePlanIdentifier(planItem.id) || `index:${index}`;
    if (!lookup.has(id)) {
      lookup.set(id, planItem);
    }
  });

  return lookup;
};

export const planStepIsBlocked = (
  step: PlanSnapshotStep | null | undefined,
  planOrLookup: PlanSnapshot | Map<string, PlanSnapshotStep> | null | undefined,
): boolean => {
  if (!step || typeof step !== 'object') {
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
        : new Map<string, PlanSnapshotStep>();

  if (lookup.size === 0) {
    return true;
  }

  for (const rawId of dependencies) {
    const dependencyId = normalizePlanIdentifier(rawId as IdentifierCandidate);
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

export const planHasOpenSteps = (plan: PlanSnapshot | null | undefined): boolean => {
  if (!Array.isArray(plan) || plan.length === 0) {
    return false;
  }

  return plan.some((item) => {
    if (!item || typeof item !== 'object') {
      return false;
    }

    return !isTerminalStatus(item.status);
  });
};

export interface PlanProgress {
  completedSteps: number;
  remainingSteps: number;
  totalSteps: number;
  ratio: number;
}

const aggregateProgress = (items: PlanSnapshotStep[]): { completed: number; total: number } => {
  let completed = 0;
  let total = 0;

  if (!Array.isArray(items) || items.length === 0) {
    return { completed, total };
  }

  for (const item of items) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    total += 1;
    if (isTerminalStatus(item.status)) {
      completed += 1;
    }
  }

  return { completed, total };
};

export const computePlanProgress = (plan: PlanSnapshot | null | undefined): PlanProgress => {
  const normalizedPlan: PlanSnapshot = Array.isArray(plan) ? plan : [];
  const { completed, total } = aggregateProgress(normalizedPlan);
  const ratio = total > 0 ? Math.min(1, Math.max(0, completed / total)) : 0;
  const remaining = Math.max(0, total - completed);

  return {
    completedSteps: completed,
    remainingSteps: remaining,
    totalSteps: total,
    ratio,
  };
};
