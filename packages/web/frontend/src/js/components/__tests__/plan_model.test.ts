import { describe, expect, test } from '@jest/globals';
import {
  computePlanProgress,
  computeStatusState,
  decoratePlan,
  summariseProgress,
  type PlanStep,
} from '../plan_model.js';

// Basic helpers so the tests read clearly without rebuilding payloads inline.
const step = (overrides: Partial<PlanStep> = {}): PlanStep => ({
  id: overrides.id ?? undefined,
  title: overrides.title ?? undefined,
  status: overrides.status ?? undefined,
  priority: overrides.priority ?? undefined,
  waitingForId: overrides.waitingForId ?? undefined,
});

describe('plan_model helpers', () => {
  test('decoratePlan orders unblocked items before blocked ones', () => {
    const plan: PlanStep[] = [
      step({ id: 'c', status: 'pending', waitingForId: ['b'] }),
      step({ id: 'a', status: 'completed' }),
      step({ id: 'b', status: 'running' }),
    ];

    const decorated = decoratePlan(plan);

    expect(decorated.map((entry) => entry.item.id)).toEqual(['a', 'b', 'c']);
    expect(decorated[2]?.blocked).toBe(true);
  });

  test('computeStatusState falls back to blocked copy when dependencies missing', () => {
    const blocked = computeStatusState(undefined, true);
    expect(blocked).toEqual({ label: 'Waiting on dependencies', state: 'blocked' });

    const active = computeStatusState('working', false);
    expect(active.state).toBe('active');
  });

  test('computePlanProgress tracks counts and percentage', () => {
    const plan: PlanStep[] = [
      step({ status: 'completed' }),
      step({ status: 'complete' }),
      step({ status: 'in progress' }),
    ];

    const progress = computePlanProgress(plan);

    expect(progress).toMatchObject({
      completedSteps: 2,
      remainingSteps: 1,
      totalSteps: 3,
    });
    expect(progress.ratio).toBeCloseTo(2 / 3);

    // The helper keeps the copy logic centralised for the UI.
    expect(summariseProgress(progress)).toBe('2 of 3 steps complete • 1 step remaining');
  });
});
