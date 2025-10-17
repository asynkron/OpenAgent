export interface PlanAutoResponseTracker {
  increment: () => number;
  reset: () => void;
  /**
   * Optional getter so hosts that only care about increment/reset can still
   * plug in a tracker. When omitted we synthesize the count from increment
   * calls to preserve reminder semantics.
   */
  getCount?: () => number | null | undefined;
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
  let fallbackCount = 0;

  if (tracker && typeof tracker.increment === 'function' && typeof tracker.reset === 'function') {
    return {
      // Call methods on the tracker to preserve `this` binding for stateful implementations.
      recordAttempt: () => {
        const nextCount = tracker.increment();
        if (typeof tracker.getCount === 'function') {
          fallbackCount =
            typeof nextCount === 'number' && Number.isFinite(nextCount)
              ? nextCount
              : fallbackCount + 1;
          return fallbackCount;
        }

        fallbackCount =
          typeof nextCount === 'number' && Number.isFinite(nextCount)
            ? nextCount
            : fallbackCount + 1;
        return fallbackCount;
      },
      reset: () => {
        tracker.reset();
        fallbackCount = 0;
      },
      getCount: () => {
        if (typeof tracker.getCount === 'function') {
          const count = tracker.getCount();
          if (typeof count === 'number' && Number.isFinite(count)) {
            fallbackCount = count;
            return count;
          }
          return fallbackCount;
        }
        return fallbackCount;
      },
    };
  }

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
