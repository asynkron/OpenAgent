/**
 * Canonical plan status enumeration.
 *
 * Using an enum keeps the status vocabulary explicit while avoiding string
 * unions scattered across the codebase.
 */
export enum PlanStatus {
  Pending = 'pending',
  Running = 'running',
  Completed = 'completed',
  Failed = 'failed',
  Abandoned = 'abandoned',
}

/**
 * Convenience lookup for status normalization helpers.
 */
export const TERMINAL_PLAN_STATUSES: readonly PlanStatus[] = [
  PlanStatus.Completed,
  PlanStatus.Failed,
  PlanStatus.Abandoned,
];
