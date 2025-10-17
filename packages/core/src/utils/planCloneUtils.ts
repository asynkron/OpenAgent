import type { PlanObservation, PlanStep } from '../contracts/index.js';

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

type PlanStepDependency = NonNullable<PlanStep['waitingForId']>[number];

export type PlanSnapshotStatus = PlanStep['status'] | 'running';

export type PlanSnapshotCommand = PlanStep['command'];

export interface PlanSnapshotStep {
  id?: PlanStep['id'] | number;
  title?: PlanStep['title'];
  status?: PlanSnapshotStatus;
  waitingForId?: (PlanStepDependency | number)[];
  command?: PlanSnapshotCommand | null;
  observation?: PlanObservation | null;
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
