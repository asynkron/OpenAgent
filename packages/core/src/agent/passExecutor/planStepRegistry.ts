import type { PlanStep } from './planExecution.js';
import { extractPlanStepIdentifier, type StepIdentifier } from './planStepIdentifier.js';

export class PlanStepRegistry {
  private readonly completedSteps = new Set<StepIdentifier>();

  markCompleted(stepId: StepIdentifier): void {
    this.completedSteps.add(stepId);
  }

  isCompleted(stepId: StepIdentifier): boolean {
    return this.completedSteps.has(stepId);
  }

  clear(): void {
    this.completedSteps.clear();
  }

  filterCompletedSteps(plan: PlanStep[] | null): PlanStep[] | null {
    if (!Array.isArray(plan)) {
      return null;
    }

    if (plan.length === 0) {
      return [];
    }

    const filtered = plan.filter((candidate) => {
      const identifier = extractPlanStepIdentifier(candidate);
      if (!identifier) {
        return true;
      }
      return !this.isCompleted(identifier);
    });

    return filtered.length > 0 ? filtered : [];
  }
}

export const globalRegistry = new PlanStepRegistry();
