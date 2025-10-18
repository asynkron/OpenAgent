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
  type PlanSnapshot,
  type PlanProgress,
} from '../utils/plan.js';
import type { StatusRuntimeEvent } from './runtimeTypes.js';

export interface PlanManagerEvents {
  type: 'plan-progress';
  progress: PlanProgress;
}

export type EmitFn = (event: PlanManagerEvents) => void;
export type EmitStatusFn = (event: StatusRuntimeEvent) => void;

export interface PlanPersistenceAdapter {
  load(): Promise<PlanSnapshot>;
  save(plan: PlanSnapshot): Promise<void>;
  clear(): Promise<void>;
}

export interface PlanManagerOptions {
  emit: EmitFn;
  emitStatus: EmitStatusFn;
  clonePlan?: (plan: PlanSnapshot) => PlanSnapshot;
  computeProgress?: (plan: PlanSnapshot) => PlanProgress;
  getPlanMergeFlag?: () => boolean;
  persistence?: PlanPersistenceAdapter | null;
}

const defaultClone = (plan: PlanSnapshot): PlanSnapshot => clonePlanTree(plan);

const noopPersistence: PlanPersistenceAdapter = {
  async load(): Promise<PlanSnapshot> {
    return [];
  },
  async save(): Promise<void> {
    // no-op persistence handler
  },
  async clear(): Promise<void> {
    // no-op persistence handler
  },
};

export function createPlanManager({
  emit,
  emitStatus,
  clonePlan = defaultClone,
  computeProgress = computePlanProgress,
  getPlanMergeFlag,
  persistence,
}: PlanManagerOptions) {
  if (typeof emit !== 'function') {
    throw new TypeError('createPlanManager requires an emit function.');
  }
  if (typeof emitStatus !== 'function') {
    throw new TypeError('createPlanManager requires an emitStatus function.');
  }

  let activePlan: PlanSnapshot = [];
  let lastProgressSignature: string | null = null;
  const mergeFlagResolver = typeof getPlanMergeFlag === 'function' ? getPlanMergeFlag : () => true;
  const persistenceAdapter = persistence ?? noopPersistence;

  const emitPlanProgressEvent = (plan: PlanSnapshot) => {
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
    if (activePlan.length === 0) {
      await persistenceAdapter.clear();
      return;
    }

    await persistenceAdapter.save(clonePlan(activePlan));
  };

  const loadPlanSnapshot = async () => {
    try {
      const loaded = await persistenceAdapter.load();
      if (Array.isArray(loaded)) {
        activePlan = clonePlan(loaded as PlanSnapshot);
        return;
      }

      emitStatus({
        type: 'status',
        level: 'warn',
        message: 'Plan persistence adapter returned an invalid snapshot. Resetting plan.',
      });
      activePlan = [];
    } catch (error) {
      emitStatus({
        type: 'status',
        level: 'warn',
        message: 'Failed to load plan snapshot. Resetting plan.',
        details: error instanceof Error ? error.message : String(error),
      });
      activePlan = [];
    }
  };

  const sanitizeIncomingPlan = (plan: unknown): PlanSnapshot => {
    if (!Array.isArray(plan)) {
      emitStatus({
        type: 'status',
        level: 'warn',
        message: 'Plan manager received an invalid plan snapshot. Ignoring payload.',
      });
      return [];
    }

    return clonePlan(plan as PlanSnapshot);
  };

  const applyUpdate = (incomingPlan: PlanSnapshot, mergeEnabled: boolean) => {
    if (incomingPlan.length === 0) {
      if (!mergeEnabled) {
        if (activePlan.length > 0) {
          emitStatus({
            type: 'status',
            level: 'info',
            message: 'Cleared active plan after receiving an empty plan while merging is disabled.',
          });
        }
        activePlan = [];
      }
      return;
    }

    if (mergeEnabled && activePlan.length > 0) {
      activePlan = mergePlanTrees(activePlan, incomingPlan);
      return;
    }

    if (activePlan.length > 0) {
      emitStatus({
        type: 'status',
        level: 'info',
        message: 'Replacing active plan with assistant update because plan merging is disabled.',
      });
    }

    activePlan = incomingPlan;
  };

  return {
    get(): PlanSnapshot {
      return clonePlan(activePlan);
    },
    async update(nextPlan: PlanSnapshot | null | undefined): Promise<PlanSnapshot> {
      const mergeEnabled = mergeFlagResolver();
      const sanitizedPlan = sanitizeIncomingPlan(nextPlan);
      applyUpdate(sanitizedPlan, mergeEnabled);

      emitPlanProgressEvent(activePlan);
      await persistPlanSnapshot();
      return clonePlan(activePlan);
    },
    async sync(nextPlan: PlanSnapshot | null | undefined): Promise<PlanSnapshot> {
      if (!Array.isArray(nextPlan)) {
        emitStatus({
          type: 'status',
          level: 'warn',
          message: 'Plan manager received an invalid plan snapshot during sync. Resetting plan.',
        });
        activePlan = [];
      } else {
        activePlan = clonePlan(nextPlan as PlanSnapshot);
      }

      emitPlanProgressEvent(activePlan);
      await persistPlanSnapshot();
      return clonePlan(activePlan);
    },
    async initialize(): Promise<PlanSnapshot> {
      await loadPlanSnapshot();
      emitPlanProgressEvent(activePlan);
      await persistPlanSnapshot();
      return clonePlan(activePlan);
    },
    async reset(): Promise<PlanSnapshot> {
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
