import { buildPlanLookup, planStepIsBlocked } from '../../utils/plan.js';

export type PlanStatus = 'pending' | 'running' | 'completed' | 'failed' | 'abandoned' | string;

export interface PlanCommand {
  run?: string;
  shell?: string;
  [key: string]: unknown;
}

export interface PlanStep {
  id?: string | number;
  status?: PlanStatus;
  age?: number;
  command?: PlanCommand | null;
  priority?: number | string;
  [key: string]: unknown;
}

export interface ExecutablePlanStep {
  step: PlanStep;
  command: PlanCommand;
}

const TERMINAL_PLAN_STATUSES = new Set<PlanStatus>(['completed', 'failed', 'abandoned']);

const iterateNestedPlanGroups = (step: PlanStep): PlanStep[][] => {
  const candidateGroups: unknown[] = [];

  const record = step as Record<string, unknown>;
  candidateGroups.push(record.substeps, record.children, record.steps);

  return candidateGroups.filter(Array.isArray) as PlanStep[][];
};

export const ensurePlanStepAge = (plan: PlanStep[]): void => {
  for (const step of plan) {
    if (!step || typeof step !== 'object') {
      continue;
    }

    const numericAge = typeof step.age === 'number' ? step.age : NaN;
    step.age = Number.isInteger(numericAge) && numericAge >= 0 ? numericAge : 0;

    for (const nestedGroup of iterateNestedPlanGroups(step)) {
      ensurePlanStepAge(nestedGroup);
    }
  }
};

export const incrementRunningPlanStepAges = (plan?: PlanStep[] | null): void => {
  if (!Array.isArray(plan)) {
    return;
  }

  plan.forEach((step) => {
    if (!step || typeof step !== 'object') {
      return;
    }

    const status = typeof step.status === 'string' ? step.status.trim().toLowerCase() : '';
    if (status === 'running') {
      const numericAge = typeof step.age === 'number' ? step.age : 0;
      step.age = Number.isInteger(numericAge) && numericAge >= 0 ? numericAge + 1 : 1;
    }
  });
};

export const hasCommandPayload = (command: unknown): command is PlanCommand => {
  if (!command || typeof command !== 'object') {
    return false;
  }

  const normalized = command as PlanCommand;
  const run = typeof normalized.run === 'string' ? normalized.run.trim() : '';
  const shell = typeof normalized.shell === 'string' ? normalized.shell.trim() : '';

  return Boolean(run || shell);
};

export const collectExecutablePlanSteps = (plan: PlanStep[]): ExecutablePlanStep[] => {
  const executable: ExecutablePlanStep[] = [];

  const lookup = buildPlanLookup(plan);

  plan.forEach((item) => {
    if (!item || typeof item !== 'object') {
      return;
    }

    const status = typeof item.status === 'string' ? item.status.trim().toLowerCase() : '';
    const blocked = planStepIsBlocked(item, lookup);

    if (!blocked && !TERMINAL_PLAN_STATUSES.has(status) && hasCommandPayload(item.command)) {
      executable.push({ step: item, command: item.command! });
    }
  });

  return executable;
};

export const getPriorityScore = (step: PlanStep): number => {
  if (!step || typeof step !== 'object') {
    return Number.POSITIVE_INFINITY;
  }

  const numericPriority = Number((step as PlanStep).priority);
  if (Number.isFinite(numericPriority)) {
    return numericPriority;
  }

  return Number.POSITIVE_INFINITY;
};

export const clonePlanForExecution = (plan: PlanStep[]): PlanStep[] => {
  return JSON.parse(JSON.stringify(plan)) as PlanStep[];
};
