import { clonePlanTree, type PlanCommand, type PlanItem, type PlanTree } from '../../utils/plan.js';
import type { PlanStatus as KnownPlanStatus } from '../../utils/planStatusUtils.js';

export type PlanStatus = PlanItem['status'];
export type PlanStep = PlanItem;

export interface ExecutablePlanStep {
  step: PlanStep;
  command: PlanCommand;
}

const TERMINAL_PLAN_STATUSES = new Set<KnownPlanStatus>(['completed', 'failed', 'abandoned']);

const normalizeIdentifier = (value: unknown): string | null => {
  if (typeof value === 'string' || typeof value === 'number') {
    const normalized = String(value).trim();
    return normalized ? normalized : null;
  }

  return null;
};

export const normalizeWaitingForIds = (step: PlanStep | null | undefined): string[] => {
  if (!step) {
    return [];
  }

  const rawDependencies = Array.isArray(step.waitingForId) ? step.waitingForId : [];
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const candidate of rawDependencies) {
    const normalizedId = normalizeIdentifier(candidate);
    if (!normalizedId || seen.has(normalizedId)) {
      continue;
    }

    seen.add(normalizedId);
    normalized.push(normalizedId);
  }

  return normalized;
};

export const hasCommandPayload = (command: PlanCommand | null | undefined): command is PlanCommand => {
  if (!command || typeof command !== 'object') {
    return false;
  }

  const run = typeof command.run === 'string' ? command.run.trim() : '';
  const shell = typeof command.shell === 'string' ? command.shell.trim() : '';

  return Boolean(run || shell);
};

export const collectExecutablePlanSteps = (
  plan: PlanTree | null | undefined,
): ExecutablePlanStep[] => {
  const executable: ExecutablePlanStep[] = [];

  if (!Array.isArray(plan)) {
    return executable;
  }

  plan.forEach((item) => {
    const status = typeof item.status === 'string' ? item.status.trim().toLowerCase() : '';
    const waitingFor = normalizeWaitingForIds(item);

    if (
      waitingFor.length === 0 &&
      !TERMINAL_PLAN_STATUSES.has(status as KnownPlanStatus) &&
      hasCommandPayload(item.command)
    ) {
      executable.push({ step: item, command: item.command! });
    }
  });

  return executable;
};

export const getPriorityScore = (step: PlanStep | null | undefined): number => {
  if (!step) {
    return Number.POSITIVE_INFINITY;
  }

  const numericPriority = Number(step.priority);
  if (Number.isFinite(numericPriority)) {
    return numericPriority;
  }

  return Number.POSITIVE_INFINITY;
};

export const clonePlanForExecution = (plan: PlanTree | null | undefined): PlanTree => {
  return clonePlanTree(plan ?? []);
};
