import { describe, expect, test } from '@jest/globals';

import {
  mergePlanTrees,
  planHasOpenSteps,
  planToMarkdown,
  computePlanProgress,
} from '../../packages/core/src/utils/plan.js';

describe('plan utilities', () => {
  test('mergePlanTrees preserves hidden steps while merging new substeps', () => {
    const existingPlan = [
      { step: '1', title: 'do stuff', status: 'running' },
      { step: '2', title: 'do other stuff', status: 'pending' },
    ];

    const incomingPlan = [
      {
        step: '1',
        title: 'do stuff',
        status: 'running',
        substeps: [
          { step: '1.1', title: 'blabla', status: 'pending' },
          { step: '1.2', title: 'more blabla', status: 'pending' },
        ],
      },
    ];

    const merged = mergePlanTrees(existingPlan, incomingPlan);

    // Step 2 should remain even though the update omitted it entirely.
    expect(merged).toHaveLength(2);
    expect(merged[0].substeps).toHaveLength(2);
    expect(merged[1].step).toBe('2');
    expect(existingPlan[0].substeps).toBeUndefined();
  });

  test('mergePlanTrees clears plan when incoming plan is empty', () => {
    const existingPlan = [{ step: '1', title: 'done work', status: 'completed' }];

    const merged = mergePlanTrees(existingPlan, []);
    expect(merged).toEqual([]);
  });

  test('planToMarkdown renders a readable outline', () => {
    const plan = [
      {
        step: '1',
        title: 'Root task',
        status: 'in_progress',
        substeps: [{ step: '1.1', title: 'Nested task', status: 'completed' }],
      },
      { step: '2', title: 'Final task', status: 'pending' },
    ];

    const markdown = planToMarkdown(plan);

    expect(markdown.startsWith('# Active Plan\n\n')).toBe(true);
    expect(markdown).toContain('Step 1 - Root task [in_progress]');
    expect(markdown).toContain('  Step 1.1 - Nested task [completed]');
    expect(markdown).toContain('Step 2 - Final task [pending]');
  });

  test('planHasOpenSteps detects unfinished nested work across key names', () => {
    const plan = [
      {
        step: '1',
        title: 'Parent',
        status: 'completed',
        children: [
          { step: '1.1', title: 'Child 1', status: 'completed' },
          { step: '1.2', title: 'Child 2', status: 'running' },
        ],
      },
    ];

    expect(planHasOpenSteps(plan)).toBe(true);

    plan[0].children[1].status = 'completed';
    expect(planHasOpenSteps(plan)).toBe(false);
  });

  test('computePlanProgress returns completed vs total leaf tasks', () => {
    const plan = [
      { title: 'Task A', status: 'completed' },
      { title: 'Task B', status: 'pending' },
      { title: 'Task C', status: 'done' },
    ];

    const progress = computePlanProgress(plan);

    expect(progress.completedSteps).toBe(2);
    expect(progress.totalSteps).toBe(3);
    expect(progress.remainingSteps).toBe(1);
    expect(progress.ratio).toBeCloseTo(2 / 3, 5);
  });

  test('computePlanProgress aggregates nested subtasks recursively', () => {
    const plan = [
      {
        step: '1',
        title: 'Parent work',
        status: 'running',
        substeps: [
          { step: '1.1', title: 'Child 1', status: 'completed' },
          { step: '1.2', title: 'Child 2', status: 'completed' },
          { step: '1.3', title: 'Child 3', status: 'blocked' },
        ],
      },
      { step: '2', title: 'Follow-up', status: 'pending' },
    ];

    const progress = computePlanProgress(plan);

    expect(progress.completedSteps).toBe(2);
    expect(progress.totalSteps).toBe(4);
    expect(progress.ratio).toBeCloseTo(0.5, 5);
  });
});
