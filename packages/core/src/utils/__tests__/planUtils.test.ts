/* eslint-env jest */
import { buildPlanLookup, planHasOpenSteps, planStepIsBlocked } from '../plan.js';
import type { PlanEntry } from '../../agent/passExecutor/planTypes.js';

describe('plan utilities', () => {
  test('returns false for empty or non-array plans', () => {
    expect(planHasOpenSteps(undefined)).toBe(false);
    expect(planHasOpenSteps(null)).toBe(false);
    expect(planHasOpenSteps({} as never)).toBe(false);
    expect(planHasOpenSteps([])).toBe(false);
  });

  test('detects pending steps', () => {
    const plan: PlanEntry[] = [
      { step: '1', title: 'Do things', status: 'completed' },
      { step: '2', title: 'Next', status: 'pending' },
    ];

    expect(planHasOpenSteps(plan)).toBe(true);
  });

  test('returns false when every step is terminal', () => {
    const plan: PlanEntry[] = [
      { id: 'a', title: 'Parent', status: 'completed' },
      { id: 'b', title: 'Child', status: 'failed' },
    ];

    expect(planHasOpenSteps(plan)).toBe(false);
  });
});

describe('planStepIsBlocked', () => {
  test('returns false when step has no dependencies', () => {
    const step: PlanEntry = { id: 'b', title: 'Task', status: 'pending' };

    expect(planStepIsBlocked(step, [])).toBe(false);
  });

  test('returns true when waiting for unfinished dependency', () => {
    const plan: PlanEntry[] = [
      { id: 'a', title: 'Prepare', status: 'running' },
      { id: 'b', title: 'Execute', status: 'pending', waitingForId: ['a'] },
    ];
    const lookup = buildPlanLookup(plan);

    expect(planStepIsBlocked(plan[1], lookup)).toBe(true);
  });

  test('returns false when dependencies completed', () => {
    const plan: PlanEntry[] = [
      { id: 'a', title: 'Prepare', status: 'completed' },
      { id: 'b', title: 'Execute', status: 'pending', waitingForId: ['a'] },
    ];
    const lookup = buildPlanLookup(plan);

    expect(planStepIsBlocked(plan[1], lookup)).toBe(false);
  });

  test('treats failed dependency as blocked', () => {
    const plan: PlanEntry[] = [
      { id: 'a', title: 'Prepare', status: 'failed' },
      { id: 'b', title: 'Execute', status: 'pending', waitingForId: ['a'] },
    ];
    const lookup = buildPlanLookup(plan);

    expect(planStepIsBlocked(plan[1], lookup)).toBe(true);
  });

  test('treats missing dependency as blocked', () => {
    const step: PlanEntry = { id: 'b', title: 'Execute', status: 'pending', waitingForId: ['missing'] };

    expect(planStepIsBlocked(step, [])).toBe(true);
  });
});
