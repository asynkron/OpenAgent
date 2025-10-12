/**
 * Pure data helpers for plan rendering logic.
 * Keeping them isolated from DOM code simplifies testing while giving TypeScript
 * a precise picture of the agent plan payload shape.
 */
const COMPLETED_STATUSES = new Set(['completed', 'complete', 'done', 'finished']);
const ACTIVE_KEYWORDS = ['progress', 'working', 'running', 'executing', 'active', 'doing'];
const BLOCKED_KEYWORDS = ['blocked', 'failed', 'error', 'stuck'];
const TERMINAL_STATUSES = new Set(['completed', 'complete', 'done', 'finished', 'failed']);

export interface PlanStep {
  id?: string | null;
  title?: string | null;
  status?: string | null;
  priority?: number | string | null;
  waitingForId?: ReadonlyArray<string | null | undefined> | null;
}

export interface DecoratedPlanEntry {
  item: PlanStep;
  waitingFor: string[];
  blocked: boolean;
  priority: number;
  index: number;
}

export type PlanStatusState = 'blocked' | 'pending' | 'completed' | 'active';

export interface NormalisedStatus {
  label: string;
  state: PlanStatusState;
}

export interface PlanProgress {
  completedSteps: number;
  remainingSteps: number;
  totalSteps: number;
  ratio: number;
}

export function normaliseText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeId(value: unknown): string {
  return normaliseText(value);
}

export function computeStatusState(status: unknown, blocked: boolean): NormalisedStatus {
  const text = normaliseText(status);

  if (blocked) {
    const label = text || 'Waiting on dependencies';
    return { label, state: 'blocked' };
  }

  if (!text) {
    return { label: 'Pending', state: 'pending' };
  }

  const normalised = text.toLowerCase();
  if (COMPLETED_STATUSES.has(normalised) || normalised.startsWith('complete')) {
    return { label: text, state: 'completed' };
  }

  if (BLOCKED_KEYWORDS.some((keyword) => normalised.includes(keyword))) {
    return { label: text, state: 'blocked' };
  }

  if (ACTIVE_KEYWORDS.some((keyword) => normalised.includes(keyword))) {
    return { label: text, state: 'active' };
  }

  if (
    normalised.includes('pending') ||
    normalised.includes('todo') ||
    normalised.includes('to do')
  ) {
    return { label: text, state: 'pending' };
  }

  return { label: text, state: 'active' };
}

export function dependenciesFor(step: PlanStep | null | undefined): string[] {
  if (!step || typeof step !== 'object' || !Array.isArray(step.waitingForId)) {
    return [];
  }

  return step.waitingForId
    .map((value) => normalizeId(value))
    .filter((value): value is string => value.length > 0);
}

export function buildPlanLookup(plan: PlanStep[] | null | undefined): Map<string, PlanStep> {
  const lookup = new Map<string, PlanStep>();

  if (!Array.isArray(plan)) {
    return lookup;
  }

  plan.forEach((item, index) => {
    if (!item || typeof item !== 'object') {
      return;
    }

    const id = normalizeId(item.id) || `index:${index}`;
    if (!lookup.has(id)) {
      lookup.set(id, item);
    }
  });

  return lookup;
}

export function isTerminalStatus(status: unknown): boolean {
  if (typeof status !== 'string') {
    return false;
  }

  const normalized = status.trim().toLowerCase();
  return TERMINAL_STATUSES.has(normalized) || normalized.startsWith('complete');
}

export function isStepBlocked(
  step: PlanStep | null | undefined,
  lookup: Map<string, PlanStep>,
): boolean {
  const dependencies = dependenciesFor(step);
  if (dependencies.length === 0) {
    return false;
  }

  if (lookup.size === 0) {
    return true;
  }

  for (const dependencyId of dependencies) {
    const dependency = lookup.get(dependencyId);
    if (!dependency || !isTerminalStatus(dependency.status)) {
      return true;
    }
  }

  return false;
}

export function parsePriority(value: PlanStep['priority']): number {
  const numeric = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(numeric) ? numeric : Number.POSITIVE_INFINITY;
}

export function decoratePlan(plan: PlanStep[] | null | undefined): DecoratedPlanEntry[] {
  if (!Array.isArray(plan)) {
    return [];
  }

  const lookup = buildPlanLookup(plan);

  return plan
    .map<DecoratedPlanEntry | null>((item, index) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const waitingFor = dependenciesFor(item);
      const blocked = isStepBlocked(item, lookup);
      const priority = parsePriority(item.priority);

      return {
        item,
        waitingFor,
        blocked,
        priority,
        index,
      } satisfies DecoratedPlanEntry;
    })
    .filter((entry): entry is DecoratedPlanEntry => Boolean(entry))
    .sort((a, b) => {
      if (a.blocked !== b.blocked) {
        return a.blocked ? 1 : -1;
      }

      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }

      return a.index - b.index;
    });
}

export function aggregateProgress(items: PlanStep[] | null | undefined): {
  completed: number;
  total: number;
} {
  let completed = 0;
  let total = 0;

  if (!Array.isArray(items) || items.length === 0) {
    return { completed, total };
  }

  items.forEach((item) => {
    if (!item || typeof item !== 'object') {
      return;
    }

    total += 1;
    const statusText = normaliseText(item.status);
    const normalized = statusText.toLowerCase();
    if (COMPLETED_STATUSES.has(normalized) || normalized.startsWith('complete')) {
      completed += 1;
    }
  });

  return { completed, total };
}

export function computePlanProgress(plan: PlanStep[] | null | undefined): PlanProgress {
  const { completed, total } = aggregateProgress(Array.isArray(plan) ? plan : []);
  const ratio = total > 0 ? Math.min(1, Math.max(0, completed / total)) : 0;
  const remaining = Math.max(0, total - completed);
  return {
    completedSteps: completed,
    remainingSteps: remaining,
    totalSteps: total,
    ratio,
  } satisfies PlanProgress;
}

export function summariseProgress(progress: PlanProgress): string {
  const completedWord = progress.totalSteps === 1 ? 'step' : 'steps';
  const completedText = `${progress.completedSteps} of ${progress.totalSteps} ${completedWord} complete`;
  if (progress.remainingSteps <= 0) {
    return `${completedText} • All steps completed`;
  }

  const remainingWord = progress.remainingSteps === 1 ? 'step' : 'steps';
  return `${completedText} • ${progress.remainingSteps} ${remainingWord} remaining`;
}
