import {
  TERMINAL_PLAN_STATUS_SET,
  normalizePlanStatus,
  type PlanStatus,
} from '../../utils/planStatusTypes.js';
import type { CommandDraft, PlanObservation } from '../../contracts/index.js';
import type { ObservationRecord } from '../historyMessageBuilder.js';

export interface PlanCommand extends CommandDraft {
  [key: string]: unknown;
}

export interface PlanStep {
  id?: string | number;
  title?: string;
  status?: PlanStatus;
  waitingForId?: Array<string | number | null | undefined>;
  command?: PlanCommand | null;
  observation?: (PlanObservation | ObservationRecord) | null;
  priority?: number | string;
  step?: string | number | null;
  [key: string]: unknown;
}

export interface ExecutablePlanStep {
  step: PlanStep;
  command: PlanCommand;
}

const normalizeIdentifier = (value: string | number | null | undefined): string | null => {
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

  const normalized = command as Partial<PlanCommand>;
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

    const status = normalizePlanStatus(item.status);
    const waitingFor = normalizeWaitingForIds(item);

    if (
      waitingFor.length === 0 &&
      (!status || !TERMINAL_PLAN_STATUS_SET.has(status)) &&
      hasCommandPayload(item.command)
    ) {
      executable.push({ step: item, command: item.command! });
    }
  });

  return executable;
};

export const getPriorityScore = (step: PlanStep | null | undefined): number => {
  if (!step || typeof step !== 'object') {
    return Number.POSITIVE_INFINITY;
  }

  const numericPriority = Number(step.priority);
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
