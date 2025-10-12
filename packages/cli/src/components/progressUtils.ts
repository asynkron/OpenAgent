/**
 * Plan progress helpers shared between Ink components and legacy console output.
 */

export type PlanProgress = {
  totalSteps?: number | null;
  completedSteps?: number | null;
  ratio?: number | null;
};

export type ProgressState = {
  total: number;
  completed: number;
  ratio: number;
  normalized: number;
  filled: number;
  empty: number;
};

const BAR_WIDTH = 20;

export function computeProgressState(progress: PlanProgress | null | undefined): ProgressState {
  if (!progress || typeof progress !== 'object') {
    return {
      total: 0,
      completed: 0,
      normalized: 0,
      filled: 0,
      empty: 20,
      ratio: 0,
    };
  }

  const total = Number.isFinite(progress.totalSteps) ? Math.max(progress.totalSteps, 0) : 0;
  const completed = Number.isFinite(progress.completedSteps)
    ? Math.max(progress.completedSteps, 0)
    : 0;
  const providedRatio = Number.isFinite(progress.ratio) ? progress.ratio : null;
  const ratio = providedRatio !== null ? providedRatio : total > 0 ? completed / total : 0;
  const normalized = Math.min(1, Math.max(0, ratio));
  let filled = Math.round(normalized * BAR_WIDTH);
  if (normalized > 0 && filled === 0) {
    filled = 1;
  }
  if (normalized >= 1) {
    filled = BAR_WIDTH;
  }
  const empty = Math.max(0, BAR_WIDTH - filled);

  return {
    total,
    completed,
    ratio,
    normalized,
    filled,
    empty,
  };
}

export function buildProgressLine(progress: PlanProgress | null | undefined): string {
  const state = computeProgressState(progress);
  if (state.total <= 0) {
    return 'Plan progress: no active steps yet.';
  }

  const filledBar = state.filled > 0 ? '█'.repeat(state.filled) : '';
  const emptyBar = state.empty > 0 ? '░'.repeat(state.empty) : '';
  const percentLabel = `${Math.round(state.normalized * 100)}%`;
  const summary = `${state.completed}/${state.total}`;
  return `Plan progress: ${filledBar}${emptyBar} ${percentLabel} (${summary})`;
}

export default {
  computeProgressState,
  buildProgressLine,
};
