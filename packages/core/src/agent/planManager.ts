// @ts-nocheck
/**
 * Plan persistence and progress tracking helpers.
 *
 * Responsibilities:
 * - Persist the active plan to `.openagent/plan.json` between passes.
 * - Track progress events and emit structured notifications when completion changes.
 *
 * Consumers:
 * - Agent loop to synchronize plan snapshots with the filesystem.
 *
 * Note: The runtime still imports the compiled `planManager.js`; run `tsc`
 * to regenerate it after editing this source until the build pipeline emits from
 * TypeScript directly.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { mergePlanTrees, computePlanProgress, clonePlanTree } from '../utils/plan.js';

export type PlanNode = Record<string, unknown>;
export type PlanTree = PlanNode[];

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
  planDirectoryPath?: string;
  planFilePath?: string;
  clonePlan?: (plan: PlanTree) => PlanTree;
  mkdirFn?: typeof mkdir;
  readFileFn?: typeof readFile;
  writeFileFn?: typeof writeFile;
  computeProgress?: (plan: PlanTree) => PlanProgress;
  serializePlanFn?: (plan: PlanTree) => string;
  deserializePlanFn?: (raw: string) => PlanTree;
}

const defaultClone = (plan: PlanTree): PlanTree => clonePlanTree(plan);

const isErrorWithCode = (value: unknown): value is { code?: unknown } =>
  Boolean(value) && typeof value === 'object' && 'code' in value;

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
  planDirectoryPath = resolve(process.cwd(), '.openagent'),
  planFilePath = resolve(planDirectoryPath, 'plan.json'),
  clonePlan = defaultClone,
  mkdirFn = mkdir,
  readFileFn = readFile,
  writeFileFn = writeFile,
  computeProgress = computePlanProgress,
  serializePlanFn = (plan) => `${JSON.stringify(plan, null, 2)}\n`,
  deserializePlanFn = (raw) => JSON.parse(raw) as PlanTree,
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
    try {
      await mkdirFn(planDirectoryPath, { recursive: true });
      const snapshot = serializePlanFn(activePlan);
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

      const parsed = deserializePlanFn(raw);
      activePlan = clonePlan(parsed);
    } catch (error: unknown) {
      if (isErrorWithCode(error) && typeof error.code === 'string' && error.code === 'ENOENT') {
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
    get(): PlanTree {
      return clonePlan(activePlan);
    },
    async update(nextPlan: PlanTree | null | undefined): Promise<PlanTree> {
      const merging = true;
      if (!Array.isArray(nextPlan) || nextPlan.length === 0) {
        if (!merging) {
          activePlan = [];
        }
      } else if (merging && activePlan.length > 0) {
        activePlan = mergePlanTrees(activePlan, nextPlan as PlanTree);
      } else {
        activePlan = clonePlan(nextPlan as PlanTree);
      }

      emitPlanProgressEvent(activePlan);
      await persistPlanSnapshot();
      return clonePlan(activePlan);
    },
    async sync(nextPlan: PlanTree | null | undefined): Promise<PlanTree> {
      if (!Array.isArray(nextPlan)) {
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
