/* eslint-env jest */
import { jest } from '@jest/globals';
import { DEFAULT_COMMAND_MAX_BYTES } from '../../constants.js';
import * as H from './helpers';
Object.assign(globalThis, H);

describe('executeAgentPass', () => {
  test('wraps multi-command execution in a single thinking span', async () => {
    const startThinkingFn = jest.fn();
    const stopThinkingFn = jest.fn();
    const executeAgentCommandImpl = jest.fn(({ command }) => ({
      result: { stdout: command.run, stderr: '', exit_code: 0 },
      executionDetails: { code: 0 },
    }));

    const { executeAgentPass, parseAssistantResponse, extractOpenAgentToolCall, planHasOpenSteps } =
      await setupPassExecutor({ executeAgentCommandImpl });

    planHasOpenSteps.mockReturnValue(true);

    const planPayload = {
      message: 'Executing plan',
      plan: [
        {
          step: '1',
          title: 'First',
          status: 'pending',
          command: { run: 'echo first', max_bytes: DEFAULT_COMMAND_MAX_BYTES },
        },
        {
          step: '2',
          title: 'Second',
          status: 'pending',
          command: { run: 'echo second', max_bytes: DEFAULT_COMMAND_MAX_BYTES },
        },
      ],
    };

    extractOpenAgentToolCall.mockReturnValue({
      name: 'open-agent',
      call_id: 'call_mock_multi',
      arguments: JSON.stringify(planPayload),
    });

    parseAssistantResponse.mockImplementation(() => ({
      ok: true,
      value: planPayload,
      recovery: { strategy: 'direct' },
    }));

    const history = [];

    const result = await executeAgentPass({
      openai: {},
      model: 'gpt-5-codex',
      history,
      emitEvent: jest.fn(),
      runCommandFn: jest.fn(),
      applyFilterFn: jest.fn(),
      tailLinesFn: jest.fn(),
      getNoHumanFlag: () => false,
      setNoHumanFlag: () => {},
      planReminderMessage: 'remember the plan',
      startThinkingFn,
      stopThinkingFn,
      escState: {},
      approvalManager: null,
      historyCompactor: null,
      planManager: null,
      emitAutoApproveStatus: false,
      passIndex: 21,
    });

    expect(result).toBe(true);
    expect(executeAgentCommandImpl).toHaveBeenCalledTimes(2);

    expect(startThinkingFn).toHaveBeenCalledTimes(1);
    expect(stopThinkingFn).toHaveBeenCalledTimes(1);

    const commandCallOrders = executeAgentCommandImpl.mock.invocationCallOrder;
    expect(commandCallOrders).toHaveLength(2);

    const thinkingStartOrder = startThinkingFn.mock.invocationCallOrder[0];
    const thinkingStopOrder = stopThinkingFn.mock.invocationCallOrder[0];

    expect(thinkingStartOrder).toBeLessThan(commandCallOrders[0]);
    expect(thinkingStopOrder).toBeGreaterThan(commandCallOrders[1]);
  });
});
