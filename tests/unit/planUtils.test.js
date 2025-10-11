import { planHasOpenSteps } from '../../packages/core/src/utils/plan.js';

describe('plan utilities', () => {
  test('returns false for empty or non-array plans', () => {
    expect(planHasOpenSteps(undefined)).toBe(false);
    expect(planHasOpenSteps(null)).toBe(false);
    expect(planHasOpenSteps({})).toBe(false);
    expect(planHasOpenSteps([])).toBe(false);
  });

  test('detects pending steps', () => {
    const plan = [
      { step: '1', title: 'Do things', status: 'completed' },
      { step: '2', title: 'Next', status: 'pending' },
    ];

    expect(planHasOpenSteps(plan)).toBe(true);
  });

  test('detects pending nested substeps', () => {
    const plan = [
      {
        step: '1',
        title: 'Parent',
        status: 'completed',
        substeps: [{ step: '1.1', title: 'Child', status: 'running' }],
      },
    ];

    expect(planHasOpenSteps(plan)).toBe(true);
  });

  test('returns false when all steps and substeps completed', () => {
    const plan = [
      {
        step: '1',
        title: 'Parent',
        status: 'completed',
        substeps: [{ step: '1.1', title: 'Child', status: 'completed' }],
      },
    ];

    expect(planHasOpenSteps(plan)).toBe(false);
  });
});
