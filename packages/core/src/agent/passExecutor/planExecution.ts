export type PlanStatus = 'pending' | 'running' | 'completed' | 'failed' | 'abandoned' | string;

export interface PlanCommand {
  run?: string;
  shell?: string;
  [key: string]: unknown;
}

export interface PlanStep {
  id?: string | number;
  status?: PlanStatus;
  command?: PlanCommand | null;
  priority?: number | string;
  [key: string]: unknown;
}

export interface ExecutablePlanStep {
  step: PlanStep;
  command: PlanCommand;
}

const TERMINAL_PLAN_STATUSES = new Set<PlanStatus>(['completed', 'failed', 'abandoned']);

const normalizeIdentifier = (value: unknown): string | null => {
  if (typeof value === 'string' || typeof value === 'number') {
    const normalized = String(value).trim();
    return normalized ? normalized : null;
  }

  return null;
};

export const normalizeWaitingForIds = (step: PlanStep | null | undefined): string[] => {
  if (!step || typeof step !== 'object') {
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

export const hasCommandPayload = (command: unknown): command is PlanCommand => {
  if (!command || typeof command !== 'object') {
    return false;
  }

  const normalized = command as PlanCommand;
  const run = typeof normalized.run === 'string' ? normalized.run.trim() : '';
  const shell = typeof normalized.shell === 'string' ? normalized.shell.trim() : '';

  return Boolean(run || shell);
};

export const collectExecutablePlanSteps = (
  plan: PlanStep[] | null | undefined,
): ExecutablePlanStep[] => {
  const executable: ExecutablePlanStep[] = [];

  if (!Array.isArray(plan)) {
    return executable;
  }

  plan.forEach((item) => {
    if (!item || typeof item !== 'object') {
      return;
    }

    const status = typeof item.status === 'string' ? item.status.trim().toLowerCase() : '';
    const waitingFor = normalizeWaitingForIds(item);

    if (waitingFor.length === 0 && !TERMINAL_PLAN_STATUSES.has(status) && hasCommandPayload(item.command)) {
      executable.push({ step: item, command: item.command! });
    }
  });

  return executable;
};

export const getPriorityScore = (step: PlanStep | null | undefined): number => {
  if (!step || typeof step !== 'object') {
    return Number.POSITIVE_INFINITY;
  }

  const numericPriority = Number((step as PlanStep).priority);
  if (Number.isFinite(numericPriority)) {
    return numericPriority;
  }

  return Number.POSITIVE_INFINITY;
};

export const clonePlanForExecution = (plan: PlanStep[] | null | undefined): PlanStep[] => {
  if (!Array.isArray(plan)) {
    return [];
  }

  return JSON.parse(JSON.stringify(plan)) as PlanStep[];
};
