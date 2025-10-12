// @ts-nocheck
/* eslint-env jest */
import { describe, expect, test, jest } from '@jest/globals';

import { createPlanManager } from '../planManager.js';

describe('createPlanManager', () => {
  test('retains existing plan when merge enabled and update receives empty plan', async () => {
    const emit = jest.fn();
    const emitStatus = jest.fn();
    const mkdirFn = jest.fn();
    const writeSnapshots = [];
    const writeFileFn = jest.fn(async (_path, contents) => {
      writeSnapshots.push(contents);
    });
    const readFileFn = jest
      .fn()
      .mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }));

    const planManager = createPlanManager({
      emit,
      emitStatus,
      getPlanMergeFlag: () => true,
      planDirectoryPath: '/tmp',
      planFilePath: '/tmp/plan.json',
      mkdirFn,
      writeFileFn,
      readFileFn,
    });

    await planManager.initialize();

    await planManager.update([
      { step: '1', title: 'Do something', status: 'pending', command: { run: 'echo hi' } },
    ]);

    const merged = await planManager.update([]);
    expect(Array.isArray(merged)).toBe(true);
    expect(merged).toHaveLength(1);
    expect(merged[0].step).toBe('1');
    expect(writeFileFn).toHaveBeenCalled();
    expect(writeSnapshots.length).toBeGreaterThan(0);
  });

  test('sync persists provided plan snapshot without merging', async () => {
    const emit = jest.fn();
    const emitStatus = jest.fn();
    const mkdirFn = jest.fn();
    const snapshots = [];
    const writeFileFn = jest.fn(async (_path, contents) => {
      snapshots.push(JSON.parse(contents));
    });
    const readFileFn = jest
      .fn()
      .mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }));

    const planManager = createPlanManager({
      emit,
      emitStatus,
      getPlanMergeFlag: () => true,
      planDirectoryPath: '/tmp',
      planFilePath: '/tmp/plan.json',
      mkdirFn,
      writeFileFn,
      readFileFn,
    });

    await planManager.initialize();
    await planManager.update([
      { step: '1', title: 'Do something', status: 'pending', command: { run: 'echo hi' } },
    ]);

    const runningPlan = [
      { step: '1', title: 'Do something', status: 'running', command: { run: 'echo hi' } },
    ];

    const synced = await planManager.sync(runningPlan);
    expect(Array.isArray(synced)).toBe(true);
    expect(synced[0].status).toBe('running');

    const persistedPlan = planManager.get();
    expect(persistedPlan[0].status).toBe('running');
    expect(snapshots[snapshots.length - 1][0].status).toBe('running');
  });

  test('preserves local status when assistant resends existing steps', async () => {
    const emit = jest.fn();
    const emitStatus = jest.fn();
    const mkdirFn = jest.fn();
    const writeFileFn = jest.fn();
    const readFileFn = jest
      .fn()
      .mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }));

    const planManager = createPlanManager({
      emit,
      emitStatus,
      planDirectoryPath: '/tmp',
      planFilePath: '/tmp/plan.json',
      mkdirFn,
      writeFileFn,
      readFileFn,
    });

    await planManager.initialize();

    await planManager.update([
      {
        id: 'step-1',
        title: 'Do something',
        status: 'completed',
        command: { run: 'echo done' },
      },
    ]);

    const merged = await planManager.update([
      {
        id: 'step-1',
        title: 'Do something',
        status: 'pending',
        command: { run: 'echo maybe' },
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
    const mkdirFn = jest.fn();
    const writeFileFn = jest.fn();
    const readFileFn = jest
      .fn()
      .mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }));

    const planManager = createPlanManager({
      emit,
      emitStatus,
      planDirectoryPath: '/tmp',
      planFilePath: '/tmp/plan.json',
      mkdirFn,
      writeFileFn,
      readFileFn,
    });

    await planManager.initialize();
    await planManager.update([
      {
        id: 'Task-1',
        title: 'Plan via Id field',
        status: 'failed',
        command: { run: 'echo nope' },
      },
    ]);

    const merged = await planManager.update([
      {
        id: 'task-1',
        title: 'Plan via Id field',
        status: 'pending',
        command: { run: 'echo nope' },
      },
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].status).toBe('failed');
  });
});
