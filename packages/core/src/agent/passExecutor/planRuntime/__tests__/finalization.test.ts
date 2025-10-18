/* eslint-env jest */
import { describe, expect, test, jest } from '@jest/globals';
import { finalizePlanRuntime } from '../finalization.js';
import { createPlanStateMachine } from '../stateMachine/index.js';
import { createPlanPersistenceCoordinator } from '../persistenceCoordinator.js';

const createPlanManagerMock = () => ({
  resolveActivePlan: jest.fn(),
  resetPlanSnapshot: jest.fn(),
  syncPlanSnapshot: jest.fn().mockResolvedValue(undefined),
});

describe('finalizePlanRuntime', () => {
  test('persists plan snapshot and records observation when plan mutated', async () => {
    const stateMachine = createPlanStateMachine();
    stateMachine.replaceActivePlan([{ id: 'root', status: 'running', command: { run: 'ls' } }]);
    const planManager = createPlanManagerMock();

    const persistence = createPlanPersistenceCoordinator(planManager);

    const result = await finalizePlanRuntime({
      persistence,
      stateMachine,
      passIndex: 2,
    });

    expect(result.type).toBe('completed');
    expect(planManager.syncPlanSnapshot).toHaveBeenCalledTimes(1);
    expect(result.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'plan-snapshot' }),
        expect.objectContaining({ type: 'history-entry' }),
      ]),
    );
    expect(stateMachine.state.planMutated).toBe(false);
  });

  test('returns noop when plan state unchanged', async () => {
    const stateMachine = createPlanStateMachine();
    const persistence = createPlanPersistenceCoordinator(createPlanManagerMock());

    const result = await finalizePlanRuntime({
      persistence,
      stateMachine,
      passIndex: 0,
    });

    expect(result).toEqual({ type: 'noop', effects: [] });
  });
});
