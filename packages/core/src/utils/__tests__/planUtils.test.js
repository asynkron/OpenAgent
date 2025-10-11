/* eslint-env jest */
import { planHasOpenSteps, planStepHasIncompleteDependencies } from '../plan.js';

describe('plan utilities', () => {
  test('returns false for empty or non-array plans', () => {
    expect(planHasOpenSteps(undefined)).toBe(false);
    expect(planHasOpenSteps(null)).toBe(false);
    expect(planHasOpenSteps({})).toBe(false);
    expect(planHasOpenSteps([])).toBe(false);
  });

  test('detects open steps when any item is not terminal', () => {
    const plan = [
      { id: 'one', title: 'Complete', status: 'completed', priority: 1, waitingForId: [] },
      { id: 'two', title: 'Working', status: 'running', priority: 2, waitingForId: [] },
    ];

    expect(planHasOpenSteps(plan)).toBe(true);

    plan[1].status = 'failed';
    expect(planHasOpenSteps(plan)).toBe(false);
  });

  test('planStepHasIncompleteDependencies inspects referenced steps', () => {
    const plan = [
      { id: 'a', title: 'Ready', status: 'completed', priority: 1, waitingForId: [] },
      { id: 'b', title: 'Blocked', status: 'pending', priority: 2, waitingForId: ['a'] },
    ];

    expect(planStepHasIncompleteDependencies(plan, plan[1])).toBe(false);

    plan[0].status = 'running';
    expect(planStepHasIncompleteDependencies(plan, plan[1])).toBe(true);
  });
});
