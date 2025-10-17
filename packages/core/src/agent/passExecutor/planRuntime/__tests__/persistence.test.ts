/* eslint-env jest */
import { beforeEach, describe, expect, test } from '@jest/globals';
import {
  prepareIncomingPlan,
  resolveActivePlan,
  resetPersistedPlan,
  syncPlanSnapshot,
} from '../persistence.js';
import { globalRegistry } from '../../planStepRegistry.js';
import type { PlanEntry } from '../../planTypes.js';

describe('planRuntime persistence helpers', () => {
  beforeEach(() => {
    globalRegistry.clear();
  });

  test('prepareIncomingPlan clears the registry when no plan remains', () => {
    globalRegistry.markCompleted('alpha');
    const result = prepareIncomingPlan([]);
    expect(result.shouldResetRegistry).toBe(true);
    expect(result.sanitizedPlan).toEqual([]);
  });

  test('resolveActivePlan filters completed steps', async () => {
    globalRegistry.markCompleted('done');
    const planManager = {
      async resolveActivePlan(): Promise<PlanEntry[]> {
        return [
          { id: 'done', status: 'completed', command: { run: 'echo ok' } },
          { id: 'next', status: 'pending', command: { run: 'echo next' } },
        ];
      },
    };

    const { plan, warning } = await resolveActivePlan(planManager, null);
    expect(warning).toBeNull();
    expect(plan).toEqual([{ id: 'next', status: 'pending', command: { run: 'echo next' } }]);
  });

  test('resolveActivePlan surfaces warnings on failure', async () => {
    const planManager = {
      async resolveActivePlan() {
        throw new Error('boom');
      },
    };

    const { plan, warning } = await resolveActivePlan(planManager, null);
    expect(plan).toBeNull();
    expect(warning).not.toBeNull();
    expect(warning?.level).toBe('warn');
  });

  test('resetPersistedPlan clears state on success and failure', async () => {
    const planManager = {
      async resetPlanSnapshot(): Promise<PlanEntry[]> {
        return [{ id: 'fresh', status: 'pending', command: { run: 'echo refreshed' } }];
      },
    };

    const success = await resetPersistedPlan(planManager);
    expect(success.plan).toEqual([
      { id: 'fresh', status: 'pending', command: { run: 'echo refreshed' } },
    ]);
    expect(success.warning).toBeNull();

    const failingManager = {
      async resetPlanSnapshot() {
        throw new Error('nope');
      },
    };

    const failure = await resetPersistedPlan(failingManager);
    expect(failure.plan).toEqual([]);
    expect(failure.warning?.message).toContain('Failed to clear persistent plan state');
  });

  test('syncPlanSnapshot reports persistence errors', async () => {
    const silentManager = {
      async syncPlanSnapshot() {},
    };

    await expect(syncPlanSnapshot(silentManager, [])).resolves.toBeNull();

    const failingManager = {
      async syncPlanSnapshot() {
        throw new Error('write failed');
      },
    };

    const warning = await syncPlanSnapshot(failingManager, []);
    expect(warning?.message).toContain('Failed to persist plan state');
  });
});
