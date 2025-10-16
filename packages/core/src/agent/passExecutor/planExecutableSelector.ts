import type { ExecutablePlanStep } from './planExecution.js';
import { getPriorityScore } from './planExecution.js';

export interface ExecutableCandidate extends ExecutablePlanStep {
  readonly index: number;
  readonly priority: number;
}

export const pickNextExecutableCandidate = (
  entries: readonly ExecutablePlanStep[],
): ExecutableCandidate | null => {
  let best: ExecutableCandidate | null = null;

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const candidate: ExecutableCandidate = {
      ...entry,
      index,
      priority: getPriorityScore(entry.step),
    };

    if (!best) {
      best = candidate;
      continue;
    }

    if (candidate.priority < best.priority) {
      best = candidate;
      continue;
    }

    if (candidate.priority === best.priority && candidate.index < best.index) {
      best = candidate;
    }
  }

  return best;
};
