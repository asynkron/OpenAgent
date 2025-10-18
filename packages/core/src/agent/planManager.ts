/**
 * Plan manager and progress tracking helpers.
 *
 * Transient-only: All filesystem persistence has been removed.
 * The active plan is kept in-memory for the duration of the runtime
 * session and never written to or read from disk.
 */

import {
  computePlanProgress,
  clonePlanTree,
  type PlanSnapshot,
  type PlanProgress,
} from '../utils/plan.js';
import { PlanManagerController } from './planManagerController.js';
import type { PlanProgressRuntimeEvent, StatusRuntimeEvent } from './runtimeTypes.js';

export type EmitFn = (event: PlanProgressRuntimeEvent) => void;
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

export interface PlanManager {
  get(): PlanSnapshot;
  update(nextPlan: PlanSnapshot | null | undefined): Promise<PlanSnapshot>;
  sync(nextPlan: PlanSnapshot | null | undefined): Promise<PlanSnapshot>;
  initialize(): Promise<PlanSnapshot>;
  reset(): Promise<PlanSnapshot>;
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
}: PlanManagerOptions): PlanManager {
  if (typeof emit !== 'function') {
    throw new TypeError('createPlanManager requires an emit function.');
  }
  if (typeof emitStatus !== 'function') {
    throw new TypeError('createPlanManager requires an emitStatus function.');
  }

  const mergeFlagResolver = typeof getPlanMergeFlag === 'function' ? getPlanMergeFlag : () => true;
  const persistenceAdapter = persistence ?? noopPersistence;

  const controller = new PlanManagerController({
    emit,
    emitStatus,
    clonePlanSnapshot: clonePlan,
    computeProgress,
    resolveMergeFlag: mergeFlagResolver,
    persistence: persistenceAdapter,
  });

  return {
    get(): PlanSnapshot {
      return controller.getSnapshot();
    },
    update(nextPlan: PlanSnapshot | null | undefined): Promise<PlanSnapshot> {
      return controller.update(nextPlan);
    },
    sync(nextPlan: PlanSnapshot | null | undefined): Promise<PlanSnapshot> {
      return controller.sync(nextPlan);
    },
    initialize(): Promise<PlanSnapshot> {
      return controller.initialize();
    },
    reset(): Promise<PlanSnapshot> {
      return controller.reset();
    },
  };
}

export default {
  createPlanManager,
};
