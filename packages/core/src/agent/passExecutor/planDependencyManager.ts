import type { PlanStep } from './planExecution.js';
import { normalizeWaitingForIds } from './planExecution.js';
import { normalizePlanIdentifier, type StepIdentifier } from './planStepIdentifier.js';

export const arraysEqual = (left: readonly string[], right: readonly string[]): boolean => {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
};

export class PlanDependencyManager {
  normalizeDependencies(plan: PlanStep[]): boolean {
    let mutated = false;

    for (const step of plan) {
      if (!step || typeof step !== 'object') {
        continue;
      }

      const sanitized = normalizeWaitingForIds(step);
      const current = Array.isArray(step.waitingForId) ? step.waitingForId : [];
      let changed = current.length !== sanitized.length;

      if (!changed) {
        for (let index = 0; index < sanitized.length; index += 1) {
          if (normalizePlanIdentifier(current[index]) !== sanitized[index]) {
            changed = true;
            break;
          }
        }
      }

      if (changed) {
        step.waitingForId = sanitized;
        mutated = true;
      }
    }

    return mutated;
  }

  removeDependencyReferences(plan: PlanStep[], stepId: StepIdentifier): boolean {
    let mutated = false;

    for (const step of plan) {
      if (!step || typeof step !== 'object') {
        continue;
      }

      const sanitized = normalizeWaitingForIds(step);
      const filtered = sanitized.filter((value) => value !== stepId);

      if (!arraysEqual(filtered, sanitized)) {
        step.waitingForId = filtered;
        mutated = true;
        continue;
      }

      const current = Array.isArray(step.waitingForId) ? step.waitingForId : [];
      let changed = current.length !== sanitized.length;

      if (!changed) {
        for (let index = 0; index < sanitized.length; index += 1) {
          if (normalizePlanIdentifier(current[index]) !== sanitized[index]) {
            changed = true;
            break;
          }
        }
      }

      if (changed) {
        step.waitingForId = sanitized;
        mutated = true;
      }
    }

    return mutated;
  }
}
