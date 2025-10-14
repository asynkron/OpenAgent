/* eslint-env jest */
import { describe, expect, test, jest } from '@jest/globals';
import { DEFAULT_COMMAND_MAX_BYTES } from '../../constants.js';

import { createPlanManager } from '../planManager.js';

describe('createPlanManager', () => {
  test('retains existing plan when merge enabled and update receives empty plan', async () => {
    const emit = jest.fn();
    const emitStatus = jest.fn();
    const planManager = createPlanManager({ emit, emitStatus });

    await planManager.initialize();

    await planManager.update([
      {
        step: '1',
        title: 'Do something',
        status: 'pending',
        command: { run: 'echo hi', max_bytes: DEFAULT_COMMAND_MAX_BYTES },
      },
    ]);

    const merged = await planManager.update([]);
    expect(Array.isArray(merged)).toBe(true);
    expect(merged).toHaveLength(1);
    expect(merged[0].step).toBe('1');
  });

  test('sync persists provided plan snapshot without merging', async () => {
    const emit = jest.fn();
    const emitStatus = jest.fn();
    const planManager = createPlanManager({ emit, emitStatus });

    await planManager.initialize();
    await planManager.update([
      {
        step: '1',
        title: 'Do something',
        status: 'pending',
        command: { run: 'echo hi', max_bytes: DEFAULT_COMMAND_MAX_BYTES },
      },
    ]);

    const runningPlan = [
      {
        step: '1',
        title: 'Do something',
        status: 'running',
        command: { run: 'echo hi', max_bytes: DEFAULT_COMMAND_MAX_BYTES },
      },
    ];

    const synced = await planManager.sync(runningPlan);
    expect(Array.isArray(synced)).toBe(true);
    expect(synced[0].status).toBe('running');

    const currentPlan = planManager.get();
    expect(currentPlan[0].status).toBe('running');
  });

  test('preserves local status when assistant resends existing steps', async () => {
    const emit = jest.fn();
    const emitStatus = jest.fn();
    const planManager = createPlanManager({ emit, emitStatus });

    await planManager.initialize();

    await planManager.update([
      {
        id: 'step-1',
        title: 'Do something',
        status: 'completed',
        command: { run: 'echo done', max_bytes: DEFAULT_COMMAND_MAX_BYTES },
      },
    ]);

    const merged = await planManager.update([
      {
        id: 'step-1',
        title: 'Do something',
        status: 'pending',
        command: { run: 'echo maybe', max_bytes: DEFAULT_COMMAND_MAX_BYTES },
        waitingForId: ['step-2'],
      },
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].status).toBe('completed');
    expect(Array.isArray(merged[0].waitingForId)).toBe(true);
    expect(merged[0].waitingForId).toEqual(['step-2']);
  });

  test('matches plan steps using case-insensitive ids when merging', async () => {
    const emit = jest.fn();
    const emitStatus = jest.fn();
    const planManager = createPlanManager({ emit, emitStatus });

    await planManager.initialize();
    await planManager.update([
      {
        id: 'Task-1',
        title: 'Plan via Id field',
        status: 'failed',
        command: { run: 'echo nope', max_bytes: DEFAULT_COMMAND_MAX_BYTES },
      },
    ]);

    const merged = await planManager.update([
      {
        id: 'task-1',
        title: 'Plan via Id field',
        status: 'pending',
        command: { run: 'echo nope', max_bytes: DEFAULT_COMMAND_MAX_BYTES },
      },
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].status).toBe('failed');
  });
});
