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
import { createPlanManagerStatusMessenger } from './planManagerStatus.js';
import {
  applyPlanUpdate,
  sanitizePlanSnapshot,
  shouldPersistPlan,
} from './planManagerState.js';

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
  const statusMessenger = createPlanManagerStatusMessenger(emitStatus);

  const clearActivePlan = () => {
    activePlan = [];
  };

  const resetPlanWithWarning = (message: string, details?: string) => {
    clearActivePlan();
    statusMessenger.warn(message, details);
  };

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
    if (!shouldPersistPlan(activePlan)) {
      await persistenceAdapter.clear();
      return;
    }

    await persistenceAdapter.save(clonePlan(activePlan));
  };

  const loadPlanSnapshot = async () => {
    try {
      const loaded = await persistenceAdapter.load();
      activePlan = sanitizePlanSnapshot(
        loaded,
        clonePlan,
        statusMessenger,
        'Plan persistence adapter returned an invalid snapshot. Resetting plan.',
      );
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);
      resetPlanWithWarning('Failed to load plan snapshot. Resetting plan.', details);
    }
  };

  return {
    get(): PlanSnapshot {
      return clonePlan(activePlan);
    },
    async update(nextPlan: PlanSnapshot | null | undefined): Promise<PlanSnapshot> {
      const mergeEnabled = mergeFlagResolver();
      const sanitizedPlan = sanitizePlanSnapshot(nextPlan, clonePlan, statusMessenger);
      activePlan = applyPlanUpdate({
        activePlan,
        incomingPlan: sanitizedPlan,
        mergeEnabled,
        messenger: statusMessenger,
        mergePlans: mergePlanTrees,
      });

      emitPlanProgressEvent(activePlan);
      await persistPlanSnapshot();
      return clonePlan(activePlan);
    },
    async sync(nextPlan: PlanSnapshot | null | undefined): Promise<PlanSnapshot> {
      if (!Array.isArray(nextPlan)) {
        resetPlanWithWarning(
          'Plan manager received an invalid plan snapshot during sync. Resetting plan.',
        );
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
      clearActivePlan();
      emitPlanProgressEvent(activePlan);
      await persistPlanSnapshot();
      return clonePlan(activePlan);
    },
  };
}

export default {
  createPlanManager,
};
