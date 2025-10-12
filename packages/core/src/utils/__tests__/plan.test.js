/* eslint-env jest */
import { describe, expect, test } from '@jest/globals';

import { mergePlanTrees, planHasOpenSteps, planToMarkdown, computePlanProgress } from '../plan.js';

describe('plan utilities', () => {
  test('mergePlanTrees updates matching steps and preserves existing ones', () => {
    const existingPlan = [
      { id: 'a', title: 'Do stuff', status: 'running', priority: 2 },
      { id: 'b', title: 'Keep me', status: 'pending' },
    ];

    const incomingPlan = [
      { id: 'a', title: 'Do stuff', status: 'completed', waitingForId: [] },
      { id: 'c', title: 'New step', status: 'pending', waitingForId: ['a'], priority: 1 },
    ];

    const merged = mergePlanTrees(existingPlan, incomingPlan);

    expect(merged).toHaveLength(3);
    expect(merged[0]).toBe(existingPlan[0]);
    expect(merged[0].status).toBe('completed');
    expect(merged[0].waitingForId).toEqual([]);
    expect(merged[1]).toEqual({
      id: 'c',
      title: 'New step',
      status: 'pending',
      waitingForId: ['a'],
      priority: 1,
    });
    expect(merged[2]).toBe(existingPlan[1]);
  });

  test('mergePlanTrees removes steps marked as abandoned', () => {
    const existingPlan = [
      { id: 'a', title: 'Keep me', status: 'running' },
      { id: 'b', title: 'Drop me', status: 'pending' },
    ];

    const incomingPlan = [{ id: 'b', title: 'Drop me', status: 'abandoned' }];

    const merged = mergePlanTrees(existingPlan, incomingPlan);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toBe(existingPlan[0]);
  });

  test('mergePlanTrees clears plan when incoming plan is empty', () => {
    const existingPlan = [{ id: 'a', title: 'Done work', status: 'completed' }];

    const merged = mergePlanTrees(existingPlan, []);
    expect(merged).toEqual([]);
  });

  test('planToMarkdown renders a flat outline with priority and dependencies', () => {
    const plan = [
      { id: 'a', title: 'Root task', status: 'in_progress', priority: 3 },
      { id: 'b', title: 'Follow-up', status: 'pending', waitingForId: ['a'], priority: 1 },
    ];

    const markdown = planToMarkdown(plan);

    expect(markdown.startsWith('# Active Plan\n\n')).toBe(true);
    expect(markdown).toContain('Step 1 - Root task [in_progress] (priority 3)');
    expect(markdown).toContain('Step 2 - Follow-up [pending] (priority 1, waiting for a)');
  });

  test('planHasOpenSteps detects unfinished steps', () => {
    const plan = [
      { id: 'a', title: 'Parent', status: 'completed' },
      { id: 'b', title: 'Child', status: 'running' },
    ];

    expect(planHasOpenSteps(plan)).toBe(true);

    plan[1].status = 'completed';
    expect(planHasOpenSteps(plan)).toBe(false);
  });

  test('computePlanProgress returns completed vs total steps', () => {
    const plan = [
      { id: 'a', title: 'Task A', status: 'completed' },
      { id: 'b', title: 'Task B', status: 'pending' },
      { id: 'c', title: 'Task C', status: 'done' },
    ];

    const progress = computePlanProgress(plan);

    expect(progress.completedSteps).toBe(2);
    expect(progress.totalSteps).toBe(3);
    expect(progress.remainingSteps).toBe(1);
    expect(progress.ratio).toBeCloseTo(2 / 3, 5);
  });
});
