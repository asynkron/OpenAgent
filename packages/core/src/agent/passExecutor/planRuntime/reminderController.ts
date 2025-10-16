import {
  PLAN_REMINDER_AUTO_RESPONSE_LIMIT,
  createPlanReminderController,
  type PlanAutoResponseTracker,
  type PlanReminderController,
} from '../planReminderController.js';

export interface RuntimeReminderController {
  recordAttempt: () => number;
  reset: () => void;
  getCount: () => number;
  hasReachedLimit: (limit?: number) => boolean;
}

export const createRuntimeReminderController = (
  tracker: PlanAutoResponseTracker | null | undefined,
): RuntimeReminderController => {
  const controller: PlanReminderController = createPlanReminderController(tracker);

  return {
    recordAttempt: () => controller.recordAttempt(),
    reset: () => controller.reset(),
    getCount: () => controller.getCount(),
    hasReachedLimit: (limit = PLAN_REMINDER_AUTO_RESPONSE_LIMIT) => controller.getCount() >= limit,
  } satisfies RuntimeReminderController;
};
