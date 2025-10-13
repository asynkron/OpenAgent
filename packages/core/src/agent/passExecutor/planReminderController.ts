export interface PlanAutoResponseTracker {
  increment: () => number;
  reset: () => void;
  getCount?: () => number;
}

export interface PlanReminderController {
  recordAttempt: () => number;
  reset: () => void;
  getCount: () => number;
}

export const PLAN_REMINDER_AUTO_RESPONSE_LIMIT = 3;

// Normalize the tracker dependency so the pass executor always interacts with a
// predictable interface even when hosts omit a custom implementation. This keeps the
// main orchestration loop focused on control flow instead of defensive bookkeeping.
export const createPlanReminderController = (
  tracker: PlanAutoResponseTracker | null | undefined,
): PlanReminderController => {
  if (tracker) {
    if (typeof tracker.increment === 'function' && typeof tracker.reset === 'function') {
      return {
        // Call methods on the tracker to preserve `this` binding for stateful implementations.
        recordAttempt: () => tracker.increment(),
        reset: () => tracker.reset(),
        getCount: () => (typeof tracker.getCount === 'function' ? tracker.getCount() ?? 0 : 0),
      };
    }
  }

  let fallbackCount = 0;
  return {
    recordAttempt: () => {
      fallbackCount += 1;
      return fallbackCount;
    },
    reset: () => {
      fallbackCount = 0;
    },
    getCount: () => fallbackCount,
  };
};
