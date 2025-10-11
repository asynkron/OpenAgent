/* eslint-env jest */
import { describe, expect, test } from '@jest/globals';

import {
  mergePlanTrees,
  planHasOpenSteps,
  planToMarkdown,
  computePlanProgress,
  planStepHasIncompleteDependencies,
} from '../plan.js';

describe('plan utilities', () => {
  test('mergePlanTrees merges updates without dropping existing entries', () => {
    const existingPlan = [
      {
        id: 'plan-1',
        title: 'Review docs',
        status: 'running',
        priority: 1,
        waitingForId: [],
      },
      {
        id: 'plan-2',
        title: 'Implement feature',
        status: 'pending',
        priority: 2,
        waitingForId: ['plan-1'],
      },
    ];

    const incomingPlan = [
      {
        id: 'plan-1',
        title: 'Review docs (updated)',
        status: 'completed',
        priority: 1,
        waitingForId: [],
      },
      {
        id: 'plan-3',
        title: 'Write tests',
        status: 'pending',
        priority: 1,
        waitingForId: ['plan-2'],
      },
    ];

    const merged = mergePlanTrees(existingPlan, incomingPlan);

    expect(merged).toHaveLength(3);
    expect(merged.find((step) => step.id === 'plan-1')?.title).toBe('Review docs (updated)');
    expect(merged.find((step) => step.id === 'plan-2')).toBe(existingPlan[1]);
    expect(merged.find((step) => step.id === 'plan-3')?.waitingForId).toEqual(['plan-2']);
  });

  test('mergePlanTrees removes abandoned steps', () => {
    const existingPlan = [
      { id: 'plan-1', title: 'Keep', status: 'running', priority: 1, waitingForId: [] },
      { id: 'plan-2', title: 'Drop', status: 'pending', priority: 2, waitingForId: [] },
    ];

    const incomingPlan = [
      { id: 'plan-2', title: 'Drop', status: 'abandoned', priority: 2, waitingForId: [] },
    ];

    const merged = mergePlanTrees(existingPlan, incomingPlan);

    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('plan-1');
  });

  test('planHasOpenSteps detects unfinished work', () => {
    expect(planHasOpenSteps([])).toBe(false);
    expect(
      planHasOpenSteps([
        { id: 'plan-1', title: 'Done', status: 'completed', priority: 1, waitingForId: [] },
      ]),
    ).toBe(false);

    expect(
      planHasOpenSteps([
        { id: 'plan-2', title: 'In progress', status: 'running', priority: 1, waitingForId: [] },
      ]),
    ).toBe(true);
  });

  test('planStepHasIncompleteDependencies returns true when dependency unfinished', () => {
    const plan = [
      { id: 'root', title: 'Root', status: 'running', priority: 1, waitingForId: [] },
      { id: 'child', title: 'Child', status: 'pending', priority: 2, waitingForId: ['root'] },
    ];

    expect(planStepHasIncompleteDependencies(plan, plan[1])).toBe(true);

    plan[0].status = 'completed';
    expect(planStepHasIncompleteDependencies(plan, plan[1])).toBe(false);
  });

  test('computePlanProgress counts completed tasks only', () => {
    const progress = computePlanProgress([
      { id: 'a', title: 'Done', status: 'completed', priority: 1, waitingForId: [] },
      { id: 'b', title: 'Pending', status: 'pending', priority: 2, waitingForId: [] },
      { id: 'c', title: 'Failed', status: 'failed', priority: 3, waitingForId: [] },
    ]);

    expect(progress.completedSteps).toBe(1);
    expect(progress.totalSteps).toBe(3);
    expect(progress.remainingSteps).toBe(2);
    expect(progress.ratio).toBeCloseTo(1 / 3, 5);
  });

  test('planToMarkdown renders flat list with priorities', () => {
    const markdown = planToMarkdown([
      { id: 'task-1', title: 'Plan work', status: 'running', priority: 1, waitingForId: [] },
      { id: 'task-2', title: 'Execute', status: 'pending', priority: 2, waitingForId: ['task-1'] },
    ]);

    expect(markdown).toContain('# Active Plan');
    expect(markdown).toContain('#task-1 - Plan work [running] (priority 1)');
    expect(markdown).toContain('#task-2 - Execute [pending] (priority 2)');
  });
});
