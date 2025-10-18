import { mergePlanTrees } from '../utils/plan.js';
import type { PlanSnapshot, PlanProgress } from '../utils/plan.js';
import type {
  EmitFn,
  EmitStatusFn,
  PlanPersistenceAdapter,
} from './planManager.js';

export interface PlanManagerControllerConfig {
  emit: EmitFn;
  emitStatus: EmitStatusFn;
  clonePlanSnapshot: (plan: PlanSnapshot) => PlanSnapshot;
  computeProgress: (plan: PlanSnapshot) => PlanProgress;
  resolveMergeFlag: () => boolean;
  persistence: PlanPersistenceAdapter;
}

export class PlanManagerController {
  private activePlan: PlanSnapshot = [];

  private lastProgressSignature: string | null = null;

  private readonly emit: EmitFn;

  private readonly emitStatus: EmitStatusFn;

  private readonly clonePlanSnapshot: (plan: PlanSnapshot) => PlanSnapshot;

  private readonly computeProgressFn: (plan: PlanSnapshot) => PlanProgress;

  private readonly resolveMergeFlag: () => boolean;

  private readonly persistence: PlanPersistenceAdapter;

  constructor({
    emit,
    emitStatus,
    clonePlanSnapshot,
    computeProgress,
    resolveMergeFlag,
    persistence,
  }: PlanManagerControllerConfig) {
    this.emit = emit;
    this.emitStatus = emitStatus;
    this.clonePlanSnapshot = clonePlanSnapshot;
    this.computeProgressFn = computeProgress;
    this.resolveMergeFlag = resolveMergeFlag;
    this.persistence = persistence;
  }

  getSnapshot(): PlanSnapshot {
    return this.clonePlanSnapshot(this.activePlan);
  }

  async update(nextPlan: PlanSnapshot | null | undefined): Promise<PlanSnapshot> {
    const mergeEnabled = this.resolveMergeFlag();
    const sanitizedPlan = this.sanitizeIncomingPlan(nextPlan);
    this.applyUpdate(sanitizedPlan, mergeEnabled);
    await this.afterPlanMutation();
    return this.clonePlanSnapshot(this.activePlan);
  }

  async sync(nextPlan: PlanSnapshot | null | undefined): Promise<PlanSnapshot> {
    if (!Array.isArray(nextPlan)) {
      this.emitStatus({
        type: 'status',
        level: 'warn',
        message: 'Plan manager received an invalid plan snapshot during sync. Resetting plan.',
      });
      this.activePlan = [];
    } else {
      this.activePlan = this.clonePlanSnapshot(nextPlan as PlanSnapshot);
    }

    await this.afterPlanMutation();
    return this.clonePlanSnapshot(this.activePlan);
  }

  async initialize(): Promise<PlanSnapshot> {
    await this.loadPlanSnapshot();
    await this.afterPlanMutation();
    return this.clonePlanSnapshot(this.activePlan);
  }

  async reset(): Promise<PlanSnapshot> {
    if (this.activePlan.length === 0) {
      this.emitPlanProgressEvent(this.activePlan);
      return this.clonePlanSnapshot(this.activePlan);
    }

    this.activePlan = [];
    await this.afterPlanMutation();
    return this.clonePlanSnapshot(this.activePlan);
  }

  private async afterPlanMutation(): Promise<void> {
    this.emitPlanProgressEvent(this.activePlan);
    await this.persistPlanSnapshot();
  }

  private emitPlanProgressEvent(plan: PlanSnapshot): PlanProgress {
    const progress = this.computeProgressFn(plan);
    const signature =
      progress.totalSteps === 0 ? null : `${progress.completedSteps}|${progress.totalSteps}`;

    if (signature === this.lastProgressSignature) {
      return progress;
    }

    if (signature === null) {
      this.lastProgressSignature = null;
      return progress;
    }

    this.lastProgressSignature = signature;
    this.emit({
      type: 'plan-progress',
      payload: {
        progress,
      },
    });
    return progress;
  }

  private async persistPlanSnapshot(): Promise<void> {
    if (this.activePlan.length === 0) {
      await this.persistence.clear();
      return;
    }

    await this.persistence.save(this.clonePlanSnapshot(this.activePlan));
  }

  private async loadPlanSnapshot(): Promise<void> {
    try {
      const loaded = await this.persistence.load();
      if (Array.isArray(loaded)) {
        this.activePlan = this.clonePlanSnapshot(loaded as PlanSnapshot);
        return;
      }

      this.emitStatus({
        type: 'status',
        payload: {
          level: 'warn',
          message: 'Plan persistence adapter returned an invalid snapshot. Resetting plan.',
          details: null,
        },
      });
      this.activePlan = [];
    } catch (error) {
      this.emitStatus({
        type: 'status',
        payload: {
          level: 'warn',
          message: 'Failed to load plan snapshot. Resetting plan.',
          details: error instanceof Error ? error.message : String(error),
        },
      });
      this.activePlan = [];
    }
  }

  private sanitizeIncomingPlan(plan: unknown): PlanSnapshot {
    if (!Array.isArray(plan)) {
      this.emitStatus({
        type: 'status',
        payload: {
          level: 'warn',
          message: 'Plan manager received an invalid plan snapshot. Ignoring payload.',
          details: null,
        },
      });
      return [];
    }

    return this.clonePlanSnapshot(plan as PlanSnapshot);
  }

  private applyUpdate(incomingPlan: PlanSnapshot, mergeEnabled: boolean): void {
    if (incomingPlan.length === 0) {
      if (!mergeEnabled) {
        if (this.activePlan.length > 0) {
          this.emitStatus({
            type: 'status',
            payload: {
              level: 'info',
              message:
                'Cleared active plan after receiving an empty plan while merging is disabled.',
              details: null,
            },
          });
        }
        this.activePlan = [];
      }
      return;
    }

    if (mergeEnabled && this.activePlan.length > 0) {
      this.activePlan = mergePlanTrees(this.activePlan, incomingPlan);
      return;
    }

    if (this.activePlan.length > 0) {
      this.emitStatus({
        type: 'status',
        payload: {
          level: 'info',
          message: 'Replacing active plan with assistant update because plan merging is disabled.',
          details: null,
        },
      });
    }

    this.activePlan = incomingPlan;
  }
}

export default PlanManagerController;
