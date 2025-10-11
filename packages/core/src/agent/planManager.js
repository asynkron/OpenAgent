import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { mergePlanTrees, computePlanProgress } from '../utils/plan.js';

function defaultClone(plan) {
  return mergePlanTrees([], Array.isArray(plan) ? plan : []);
}

function formatStatusEvent(level, message, details) {
  const event = { type: 'status', level, message };
  if (details) {
    event.details = details;
  }
  return event;
}

export function createPlanManager({
  emit,
  emitStatus,
  getPlanMergeFlag,
  planDirectoryPath = resolve(process.cwd(), '.openagent'),
  planFilePath = resolve(planDirectoryPath, 'plan.json'),
  clonePlan = defaultClone,
  mkdirFn = mkdir,
  readFileFn = readFile,
  writeFileFn = writeFile,
  computeProgress = computePlanProgress,
} = {}) {
  if (typeof emit !== 'function') {
    throw new TypeError('createPlanManager requires an emit function.');
  }
  if (typeof emitStatus !== 'function') {
    throw new TypeError('createPlanManager requires an emitStatus function.');
  }

  let activePlan = [];
  let lastProgressSignature = null;

  const shouldMergePlans = () =>
    Boolean(typeof getPlanMergeFlag === 'function' && getPlanMergeFlag());

  const emitPlanProgressEvent = (plan) => {
    const progress = computeProgress(plan);
    const signature =
      progress.totalSteps === 0 ? null : `${progress.completedSteps}|${progress.totalSteps}`;

    if (signature === lastProgressSignature) {
      return progress;
    }

    if (signature === null) {
      if (lastProgressSignature === null) {
        return progress;
      }
      lastProgressSignature = null;
      emit({ type: 'plan-progress', progress });
      return progress;
    }

    lastProgressSignature = signature;
    emit({ type: 'plan-progress', progress });
    return progress;
  };

  const persistPlanSnapshot = async () => {
    try {
      await mkdirFn(planDirectoryPath, { recursive: true });
      const snapshot = `${JSON.stringify(activePlan, null, 2)}\n`;
      await writeFileFn(planFilePath, snapshot, 'utf8');
    } catch (error) {
      emitStatus(
        formatStatusEvent(
          'warn',
          'Failed to persist plan snapshot to .openagent/plan.json.',
          error instanceof Error ? error.message : String(error),
        ),
      );
    }
  };

  const loadPlanSnapshot = async () => {
    try {
      const raw = await readFileFn(planFilePath, 'utf8');
      if (!raw.trim()) {
        activePlan = [];
        return;
      }

      const parsed = JSON.parse(raw);
      activePlan = clonePlan(parsed);
    } catch (error) {
      if (error && typeof error === 'object' && error.code === 'ENOENT') {
        return;
      }

      emitStatus(
        formatStatusEvent(
          'warn',
          'Failed to load plan snapshot from .openagent/plan.json.',
          error instanceof Error ? error.message : String(error),
        ),
      );
      activePlan = [];
    }
  };

  return {
    get() {
      return clonePlan(activePlan);
    },
    isMergingEnabled() {
      return shouldMergePlans();
    },
    async update(nextPlan) {
      const merging = shouldMergePlans();
      if (!Array.isArray(nextPlan) || nextPlan.length === 0) {
        if (!merging) {
          activePlan = [];
        }
      } else if (merging && activePlan.length > 0) {
        activePlan = mergePlanTrees(activePlan, nextPlan);
      } else {
        activePlan = clonePlan(nextPlan);
      }

      emitPlanProgressEvent(activePlan);
      await persistPlanSnapshot();
      return clonePlan(activePlan);
    },
    async sync(nextPlan) {
      if (!Array.isArray(nextPlan)) {
        activePlan = [];
      } else {
        activePlan = clonePlan(nextPlan);
      }

      emitPlanProgressEvent(activePlan);
      await persistPlanSnapshot();
      return clonePlan(activePlan);
    },
    async initialize() {
      await loadPlanSnapshot();
      emitPlanProgressEvent(activePlan);
      await persistPlanSnapshot();
      return clonePlan(activePlan);
    },
    async reset() {
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
