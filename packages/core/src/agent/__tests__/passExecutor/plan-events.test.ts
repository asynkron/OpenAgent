/* eslint-env jest */
import { jest } from '@jest/globals';
import * as H from './helpers';
Object.assign(globalThis, H);

describe('executeAgentPass', () => {
  test('re-emits plan events with in-memory updates after execution finishes', async () => {
    const { executeAgentPass, parseAssistantResponse, executeAgentCommand, planHasOpenSteps } =
      await setupPassExecutor({
        executeAgentCommandImpl: () => ({
          result: { stdout: 'oops', stderr: 'fail', exit_code: 1 },
          executionDetails: { code: 1 },
        }),
      });

    planHasOpenSteps.mockReturnValue(true);

    parseAssistantResponse.mockImplementation(() => ({
      ok: true,
      value: {
        message: 'Executing plan',
        plan: [
          {
            step: '1',
            title: 'Do the work',
            status: 'pending',
            command: { run: 'echo hello' },
          },
        ],
      },
      recovery: { strategy: 'direct' },
    }));

    const emitEvent = jest.fn();
    const history = [];

    const planManager = {
      isMergingEnabled: jest.fn().mockReturnValue(true),
      update: jest.fn().mockImplementation(async (plan) => plan),
      get: jest.fn(),
      reset: jest.fn(),
      sync: jest.fn(),
    };

    const PASS_INDEX = 12;
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

    expect(result).toBe(true);
    expect(executeAgentCommand).toHaveBeenCalledTimes(1);
    expect(planManager.sync).toHaveBeenCalledTimes(1);

    const planEvents = emitEvent.mock.calls
      .map(([event]) => event)
      .filter((event) => event && event.type === 'plan');

    expect(planEvents.length).toBeGreaterThanOrEqual(3);
    const lastPlanEvent = planEvents[planEvents.length - 1];
    expect(lastPlanEvent.plan[0].status).toBe('failed');
    expect(lastPlanEvent.plan[0]).toHaveProperty('observation');
  });
});
