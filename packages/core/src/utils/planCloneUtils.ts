import type { ToolObservation, ToolPlanStep } from '../contracts/index.js';

const hasStructuredClone = typeof globalThis.structuredClone === 'function';

export const deepCloneValue = <T>(value: T): T => {
  if (hasStructuredClone) {
    try {
      return globalThis.structuredClone(value);
    } catch {
      // Fall through to JSON fallback.
    }
  }

  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    // As a last resort return the original reference.
    return value;
  }
};

type ToolPlanDependency = NonNullable<ToolPlanStep['waitingForId']>[number];

export type PlanSnapshotStatus = ToolPlanStep['status'] | 'running';

export type PlanSnapshotCommand = ToolPlanStep['command'];

export interface PlanSnapshotStep {
  id?: ToolPlanStep['id'] | number;
  title?: ToolPlanStep['title'];
  status?: PlanSnapshotStatus;
  waitingForId?: (ToolPlanDependency | number)[];
  command?: PlanSnapshotCommand | null;
  observation?: ToolObservation | null;
  priority?: number | string;
}

export type PlanSnapshot = PlanSnapshotStep[];

export const clonePlanTree = (plan: PlanSnapshot | null | undefined): PlanSnapshot => {
  if (!Array.isArray(plan)) {
    return [];
  }

  const cloned = deepCloneValue(plan);
  return Array.isArray(cloned) ? (cloned as PlanSnapshot) : [];
};
