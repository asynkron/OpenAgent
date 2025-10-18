/* eslint-env jest */
import { describe, expect, test } from '@jest/globals';
import { initializePlanRuntime } from '../initialization.js';
import { createPlanStateMachine } from '../stateMachine/index.js';
import { createPlanPersistenceCoordinator } from '../persistenceCoordinator.js';

describe('initializePlanRuntime', () => {
  test('normalizes incoming plan and emits snapshot effect', async () => {
    const stateMachine = createPlanStateMachine();
    const incomingPlan = [
      {
        id: 'task-1',
        status: 'pending',
        command: { run: 'echo hello' },
      },
    ];

    const result = await initializePlanRuntime({
      incomingPlan,
      stateMachine,
      persistence: createPlanPersistenceCoordinator(null),
    });

    expect(result.type).toBe('plan-initialized');
    expect(result.effects).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'plan-snapshot' })]),
    );
    expect(stateMachine.state.activePlan).toHaveLength(1);
    expect(stateMachine.state.planMutated).toBe(false);
  });
});
