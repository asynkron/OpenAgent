/* eslint-env jest */
import { describe, expect, test } from '@jest/globals';
import { DEFAULT_COMMAND_MAX_BYTES } from '../../constants.js';

import { mergePlanTrees, planHasOpenSteps, planToMarkdown, computePlanProgress } from '../plan.js';
import type { PlanEntry } from '../../agent/passExecutor/planTypes.js';

describe('plan utilities', () => {
  test('mergePlanTrees updates matching step metadata while preserving runtime status', () => {
    const existingPlan: PlanEntry[] = [
      { id: 'a', title: 'Do stuff', status: 'running', priority: 2 },
      { id: 'b', title: 'Keep me', status: 'pending' },
    ];

    const incomingPlan: PlanEntry[] = [
      { id: 'a', title: 'Do stuff', status: 'completed', waitingForId: [] },
      { id: 'c', title: 'New step', status: 'running', waitingForId: ['a'], priority: 1 },
    ];

    const merged = mergePlanTrees(existingPlan, incomingPlan);

    expect(merged).toHaveLength(3);
    expect(merged[0]).toBe(existingPlan[0]);
    expect(merged[0].status).toBe('running');
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

  test('mergePlanTrees does not downgrade terminal statuses back to pending', () => {
    const existingPlan: PlanEntry[] = [
      {
        id: 'a',
        title: 'Finish work',
        status: 'completed',
        command: { run: 'echo done', max_bytes: DEFAULT_COMMAND_MAX_BYTES },
      },
    ];

    const incomingPlan: PlanEntry[] = [
      {
        id: 'a',
        title: 'Finish work',
        status: 'pending',
        command: { run: 'echo done', max_bytes: DEFAULT_COMMAND_MAX_BYTES },
      },
    ];

    const merged = mergePlanTrees(existingPlan, incomingPlan);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toBe(existingPlan[0]);
    expect(merged[0].status).toBe('completed');
  });

  test('mergePlanTrees refreshes command details and resets failed steps when command changes', () => {
    const existingCommand = {
      run: 'npm test',
      shell: '/bin/bash',
      reason: 'Execute tests',
    };
    const existingPlan: PlanEntry[] = [
      {
        id: 'task-1',
        title: 'Retry task',
        status: 'failed',
        command: existingCommand,
      },
    ];

    const incomingPlan: PlanEntry[] = [
      {
        id: 'task-1',
        title: 'Retry task',
        status: 'failed',
        command: {
          run: 'npm run lint',
          shell: '/bin/bash',
          reason: 'Lint before retrying tests',
        },
      },
    ];

    const merged = mergePlanTrees(existingPlan, incomingPlan);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toBe(existingPlan[0]);
    expect(merged[0].status).toBe('pending');
    expect(merged[0].command).toEqual({
      run: 'npm run lint',
      shell: '/bin/bash',
      reason: 'Lint before retrying tests',
    });
    expect(merged[0].command).not.toBe(incomingPlan[0].command);
  });

  test('mergePlanTrees keeps failed status when command stays the same', () => {
    const commandPayload = {
      run: 'npm test',
      shell: '/bin/bash',
    };
    const existingPlan: PlanEntry[] = [
      {
        id: 'task-2',
        title: 'Hold status',
        status: 'failed',
        command: commandPayload,
      },
    ];

    const incomingPlan: PlanEntry[] = [
      {
        id: 'task-2',
        title: 'Hold status',
        status: 'pending',
        command: {
          run: 'npm test',
          shell: '/bin/bash',
        },
      },
    ];

    const merged = mergePlanTrees(existingPlan, incomingPlan);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toBe(existingPlan[0]);
    expect(merged[0].status).toBe('failed');
  });

  test('mergePlanTrees ignores command rewrites when incoming status is completed', () => {
    const existingPlan: PlanEntry[] = [
      {
        id: 'task-3',
        title: 'Keep running status',
        status: 'running',
        command: null,
      },
    ];

    const incomingPlan: PlanEntry[] = [
      {
        id: 'task-3',
        title: 'Keep running status',
        status: 'completed',
        command: {
          run: 'echo done',
          shell: '/bin/bash',
        },
      },
    ];

    const merged = mergePlanTrees(existingPlan, incomingPlan);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toBe(existingPlan[0]);
    expect(merged[0].status).toBe('running');
    expect(merged[0].command).toBeNull();
  });

  test('mergePlanTrees resets abandoned steps to pending when command changes', () => {
    const existingPlan: PlanEntry[] = [
      {
        id: 'task-4',
        title: 'Retry after cancellation',
        status: 'abandoned',
        command: null,
      },
    ];

    const incomingPlan: PlanEntry[] = [
      {
        id: 'task-4',
        title: 'Retry after cancellation',
        status: 'pending',
        command: {
          run: 'npm run retry',
          shell: '/bin/bash',
        },
      },
    ];

    const merged = mergePlanTrees(existingPlan, incomingPlan);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toBe(existingPlan[0]);
    expect(merged[0].status).toBe('pending');
    expect(merged[0].command).toEqual({
      run: 'npm run retry',
      shell: '/bin/bash',
    });
  });

  test('mergePlanTrees forces new steps to pending status regardless of incoming status', () => {
    const existingPlan: PlanEntry[] = [{ id: 'a', title: 'Existing', status: 'running' }];

    const incomingPlan: PlanEntry[] = [
      { id: 'a', title: 'Existing', status: 'completed' },
      { id: 'b', title: 'Assistant says done', status: 'completed' },
    ];

    const merged = mergePlanTrees(existingPlan, incomingPlan);

    expect(merged).toHaveLength(2);
    expect(merged[0].status).toBe('running');
    expect(merged[1]).toEqual({ id: 'b', title: 'Assistant says done', status: 'pending' });
  });

  test('mergePlanTrees removes steps marked as abandoned', () => {
    const existingPlan: PlanEntry[] = [
      { id: 'a', title: 'Keep me', status: 'running' },
      { id: 'b', title: 'Drop me', status: 'pending' },
    ];

    const incomingPlan: PlanEntry[] = [{ id: 'b', title: 'Drop me', status: 'abandoned' }];

    const merged = mergePlanTrees(existingPlan, incomingPlan);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toBe(existingPlan[0]);
  });

  test('mergePlanTrees clears plan when incoming plan is empty', () => {
    const existingPlan: PlanEntry[] = [{ id: 'a', title: 'Done work', status: 'completed' }];

    const merged = mergePlanTrees(existingPlan, []);
    expect(merged).toEqual([]);
  });

  test('planToMarkdown renders a flat outline with priority and dependencies', () => {
    const plan: PlanEntry[] = [
      { id: 'a', title: 'Root task', status: 'running', priority: 3 },
      { id: 'b', title: 'Follow-up', status: 'pending', waitingForId: ['a'], priority: 1 },
    ];

    const markdown = planToMarkdown(plan);

    expect(markdown.startsWith('# Active Plan\n\n')).toBe(true);
    expect(markdown).toContain('Step 1 - Root task [running] (priority 3)');
    expect(markdown).toContain('Step 2 - Follow-up [pending] (priority 1, waiting for a)');
  });

  test('planHasOpenSteps detects unfinished steps', () => {
    const plan: PlanEntry[] = [
      { id: 'a', title: 'Parent', status: 'completed' },
      { id: 'b', title: 'Child', status: 'running' },
    ];

    expect(planHasOpenSteps(plan)).toBe(true);

    plan[1].status = 'completed';
    expect(planHasOpenSteps(plan)).toBe(false);
  });

  test('computePlanProgress returns completed vs total steps', () => {
    const plan: PlanEntry[] = [
      { id: 'a', title: 'Task A', status: 'completed' },
      { id: 'b', title: 'Task B', status: 'pending' },
      { id: 'c', title: 'Task C', status: 'running' },
    ];

    const progress = computePlanProgress(plan);

    expect(progress.completedSteps).toBe(1);
    expect(progress.totalSteps).toBe(3);
    expect(progress.remainingSteps).toBe(2);
    expect(progress.ratio).toBeCloseTo(1 / 3, 5);
  });
});
