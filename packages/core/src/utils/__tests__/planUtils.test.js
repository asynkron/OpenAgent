/* eslint-env jest */
import { planHasOpenSteps, planStepHasIncompleteChildren } from '../plan.js';

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

describe('planStepHasIncompleteChildren', () => {
  test('detects direct child with non-completed status', () => {
    const step = {
      step: '1',
      title: 'Parent',
      substeps: [{ step: '1.1', title: 'Child', status: 'running' }],
    };

    expect(planStepHasIncompleteChildren(step)).toBe(true);
  });

  test('returns false when all children completed', () => {
    const step = {
      step: '1',
      title: 'Parent',
      substeps: [{ step: '1.1', title: 'Child', status: 'completed' }],
    };

    expect(planStepHasIncompleteChildren(step)).toBe(false);
  });

  test('detects incomplete nested grandchildren despite completed child status', () => {
    const step = {
      step: '1',
      title: 'Parent',
      substeps: [
        {
          step: '1.1',
          title: 'Child',
          status: 'completed',
          substeps: [{ step: '1.1.1', title: 'Grandchild', status: 'pending' }],
        },
      ],
    };

    expect(planStepHasIncompleteChildren(step)).toBe(true);
  });
});
