/**
 * Plan manager and progress tracking helpers.
 *
 * Transient-only: All filesystem persistence has been removed.
 * The active plan is kept in-memory for the duration of the runtime
 * session and never written to or read from disk.
 */

import {
  mergePlanTrees,
  computePlanProgress,
  clonePlanTree,
  type PlanTree,
} from '../utils/plan.js';

export interface PlanProgress {
  completedSteps: number;
  totalSteps: number;
}

export interface PlanManagerEvents {
  type: 'plan-progress';
  progress: PlanProgress;
}

export type EmitFn = (event: PlanManagerEvents) => void;
export type EmitStatusFn = (event: {
  type: 'status';
  level: string;
  message: string;
  details?: unknown;
}) => void;

export interface PlanManagerOptions {
  emit: EmitFn;
  emitStatus: EmitStatusFn;
  clonePlan?: (plan: PlanTree | null | undefined) => PlanTree;
  computeProgress?: (plan: PlanTree) => PlanProgress;
}

const defaultClone = (plan: PlanTree | null | undefined): PlanTree => clonePlanTree(plan ?? []);

const isErrorWithCode = (value: unknown): value is { code?: unknown } =>
  typeof value === 'object' && value !== null && 'code' in value;

function formatStatusEvent(level: string, message: string, details?: unknown) {
  const event: { type: 'status'; level: string; message: string; details?: unknown } = {
    type: 'status',
    level,
    message,
  };
  if (typeof details !== 'undefined') {
    event.details = details;
  }
  return event;
}

export function createPlanManager({
  emit,
  emitStatus,
  clonePlan = defaultClone,
  computeProgress = computePlanProgress,
}: PlanManagerOptions) {
  if (typeof emit !== 'function') {
    throw new TypeError('createPlanManager requires an emit function.');
  }
  if (typeof emitStatus !== 'function') {
    throw new TypeError('createPlanManager requires an emitStatus function.');
  }

  let activePlan: PlanTree = [];
  let lastProgressSignature: string | null = null;

  const emitPlanProgressEvent = (plan: PlanTree) => {
    const progress = computeProgress(plan);
    const signature =
      progress.totalSteps === 0 ? null : `${progress.completedSteps}|${progress.totalSteps}`;

    if (signature === lastProgressSignature) {
      return progress;
    }

    if (signature === null) {
      lastProgressSignature = null;
      return progress;
    }

    lastProgressSignature = signature;
    emit({ type: 'plan-progress', progress });
    return progress;
  };

  const persistPlanSnapshot = async () => {
    // no-op (transient plan; no persistence)
  };

  const loadPlanSnapshot = async () => {
    // no-op (transient plan; no persistence)
  };

  return {
    get(): PlanTree {
      return clonePlan(activePlan);
    },
    async update(nextPlan: PlanTree | null | undefined): Promise<PlanTree> {
      const merging = true;
      const sanitizedNextPlan = clonePlan(nextPlan);

      if (!nextPlan || nextPlan.length === 0) {
        if (!merging) {
          activePlan = [];
        }
      } else if (merging && activePlan.length > 0) {
        activePlan = mergePlanTrees(activePlan, sanitizedNextPlan);
      } else {
        activePlan = sanitizedNextPlan;
      }

      emitPlanProgressEvent(activePlan);
      await persistPlanSnapshot();
      return clonePlan(activePlan);
    },
    async sync(nextPlan: PlanTree | null | undefined): Promise<PlanTree> {
      if (!nextPlan) {
        activePlan = [];
      } else {
        activePlan = clonePlan(nextPlan);
      }

      emitPlanProgressEvent(activePlan);
      await persistPlanSnapshot();
      return clonePlan(activePlan);
    },
    async initialize(): Promise<PlanTree> {
      await loadPlanSnapshot();
      emitPlanProgressEvent(activePlan);
      await persistPlanSnapshot();
      return clonePlan(activePlan);
    },
    async reset(): Promise<PlanTree> {
      if (activePlan.length === 0) {
        emitPlanProgressEvent(activePlan);
        return clonePlan(activePlan);
      }
      activePlan = [];
      emitPlanProgressEvent(activePlan);
      await persistPlanSnapshot();
      return clonePlan(activePlan);
    },
  };
}

export default {
  createPlanManager,
};
