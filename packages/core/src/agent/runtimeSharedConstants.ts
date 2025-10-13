export const NO_HUMAN_AUTO_MESSAGE = "continue or say 'done'";

export const PLAN_PENDING_REMINDER =
  'The plan is not completed, either send a command to continue, update the plan, take a deep breath and reanalyze the situation, add/remove steps or sub-steps, or abandon the plan if we don´t know how to continue';

// Guardrail used to detect runaway payload growth between consecutive model calls.
export const MAX_REQUEST_GROWTH_FACTOR = 5;
