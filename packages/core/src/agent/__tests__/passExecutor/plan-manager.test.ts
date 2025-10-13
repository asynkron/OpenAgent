/* eslint-env jest */
import { jest } from '@jest/globals';
import * as H from './helpers';
Object.assign(globalThis, H);

describe('executeAgentPass', () => {
  test('clears completed plans when no steps remain open', async () => {
    const { executeAgentPass, parseAssistantResponse, planHasOpenSteps, executeAgentCommand } =
      await setupPassExecutor();

    planHasOpenSteps.mockReturnValue(false);

    parseAssistantResponse.mockImplementation(() => ({
      ok: true,
      value: {
        message: 'Plan finished',
        plan: [
          {
            step: '1',
            title: 'Wrap up',
            status: 'completed',
          },
        ],
      },
      recovery: { strategy: 'direct' },
    }));

    const emitEvent = jest.fn();
    const history = [];
    const reset = jest.fn().mockResolvedValue([]);
    const update = jest
      .fn()
      .mockResolvedValue([{ step: '1', title: 'Wrap up', status: 'completed' }]);

    const planManager = {
      isMergingEnabled: jest.fn().mockReturnValue(true),
      update,
      get: jest.fn(),
      reset,
    };

    const PASS_INDEX = 9;
    const result = await executeAgentPass({
      openai: {},
      model: 'gpt-5-codex',
      history,
      emitEvent,
      runCommandFn: jest.fn(),
      applyFilterFn: jest.fn(),
      tailLinesFn: jest.fn(),
      getNoHumanFlag: () => false,
      setNoHumanFlag: () => {},
      planReminderMessage: 'remember the plan',
      startThinkingFn: jest.fn(),
      stopThinkingFn: jest.fn(),
      escState: {},
      approvalManager: null,
      historyCompactor: null,
      planManager,
      emitAutoApproveStatus: false,
      passIndex: PASS_INDEX,
    });

    expect(result).toBe(false);
    expect(executeAgentCommand).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);

    const planEvents = emitEvent.mock.calls
      .map(([event]) => event)
      .filter((event) => event && event.type === 'plan');
    expect(planEvents.length).toBeGreaterThanOrEqual(2);
    const clearedEvent = planEvents[planEvents.length - 1];
    expect(Array.isArray(clearedEvent.plan)).toBe(true);
    expect(clearedEvent.plan).toHaveLength(0);
  });
});
