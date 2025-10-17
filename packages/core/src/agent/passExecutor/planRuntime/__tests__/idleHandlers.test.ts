/* eslint-env jest */
import { describe, expect, test, jest } from '@jest/globals';
import { handleNoExecutableMessage, handleCommandRejection } from '../idleHandlers.js';
import { createPlanStateMachine } from '../stateMachine/index.js';

const createPlanManagerMock = () => ({
  resolveActivePlan: jest.fn(),
  resetPlanSnapshot: jest.fn().mockResolvedValue([]),
  syncPlanSnapshot: jest.fn(),
});

describe('handleNoExecutableMessage', () => {
  test('auto-responds to refusals and resets reminder', async () => {
    const stateMachine = createPlanStateMachine();

    const result = await handleNoExecutableMessage({
      parsedMessage: "Sorry, I can't help with that.",
      planManager: null,
      stateMachine,
      passIndex: 1,
    });

    expect(result.type).toBe('continue-refusal');
    expect(result.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'history-entry' }),
        expect.objectContaining({ type: 'reset-reminder' }),
      ]),
    );
  });

  test('clears plan when no executable work remains', async () => {
    const stateMachine = createPlanStateMachine();
    const planManager = createPlanManagerMock();

    const result = await handleNoExecutableMessage({
      parsedMessage: 'Done',
      planManager,
      stateMachine,
      passIndex: 2,
    });

    expect(planManager.resetPlanSnapshot).toHaveBeenCalledTimes(1);
    expect(result.type).toBe('stop-cleared');
    expect(result.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'plan-snapshot' }),
        expect.objectContaining({ type: 'reset-reminder' }),
      ]),
    );
  });
});

describe('handleCommandRejection', () => {
  test('records observation and resets reminder', () => {
    const stateMachine = createPlanStateMachine();
    const step = { id: 'c1', status: 'pending', command: { run: 'echo hi' } };
    stateMachine.replaceActivePlan([step]);

    const result = handleCommandRejection({
      planStep: step,
      stateMachine,
      passIndex: 3,
    });

    expect(result.type).toBe('command-rejected');
    expect(result.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'history-entry' }),
        expect.objectContaining({ type: 'reset-reminder' }),
      ]),
    );
  });
});
