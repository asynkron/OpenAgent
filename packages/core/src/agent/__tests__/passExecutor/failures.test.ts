/* eslint-env jest */
import { jest } from '@jest/globals';
import * as H from './helpers';
Object.assign(globalThis, H);

describe('executeAgentPass', () => {
  test('marks plan steps as failed when command exits non-zero', async () => {
    const { executeAgentPass, parseAssistantResponse, executeAgentCommand, planHasOpenSteps } =
      await setupPassExecutor({
        executeAgentCommandImpl: () => ({
          result: { stdout: '', stderr: 'boom', exit_code: 2 },
          executionDetails: { code: 2 },
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
            title: 'Failing step',
            status: 'pending',
            command: { run: 'exit 2' },
          },
        ],
      },
      recovery: { strategy: 'direct' },
    }));

    const PASS_INDEX = 13;
    const context = createTestContext(PASS_INDEX);
    const result = await executeAgentPass(context);

    expect(result).toBe(true);
    expect(executeAgentCommand).toHaveBeenCalledTimes(1);

    const planEvents = context.emitEvent.mock.calls
      .map(([event]) => event)
      .filter((event) => event && event.type === 'plan');

    expect(planEvents.length).toBeGreaterThanOrEqual(3);
    const failedEvent = planEvents.find(
      (event) => Array.isArray(event.plan) && event.plan[0]?.status === 'failed',
    );
    expect(failedEvent).toBeDefined();
  });

  test('continues executing remaining steps when a command throws', async () => {
    const thrown = new Error('synthetic failure');
    let invocation = 0;

    const {
      executeAgentPass,
      parseAssistantResponse,
      executeAgentCommand,
      planHasOpenSteps,
      buildPlanLookup,
    } = await setupPassExecutor({
      executeAgentCommandImpl: async ({ command }) => {
        invocation += 1;
        if (invocation === 1) {
          throw thrown;
        }
        return {
          result: {
            stdout: `ok: ${command?.run ?? ''}`,
            stderr: '',
            exit_code: 0,
            killed: false,
            runtime_ms: 10,
          },
          executionDetails: { type: 'EXECUTE', command },
        };
      },
    });

    parseAssistantResponse.mockImplementation(() => ({
      ok: true,
      value: {
        message: 'Run plan',
        plan: [
          { step: '1', title: 'First', status: 'pending', command: { run: 'first' } },
          { step: '2', title: 'Second', status: 'pending', command: { run: 'second' } },
        ],
      },
      recovery: { strategy: 'direct' },
    }));

    planHasOpenSteps.mockImplementation(createComplexPlanHasOpenStepsMock());
    buildPlanLookup.mockImplementation(createComplexBuildPlanLookupMock());

    const PASS_INDEX = 9;
    const context = createTestContext(PASS_INDEX);
    const result = await executeAgentPass(context);

    expect(result).toBe(true);
    expect(executeAgentCommand).toHaveBeenCalledTimes(2);

    const commandResultEvents = context.emitEvent.mock.calls
      .map(([event]) => event)
      .filter((event) => event && event.type === 'command-result');
    expect(commandResultEvents).toHaveLength(2);
    expect(commandResultEvents[0].result.exit_code).toBe(1);
    expect(commandResultEvents[1].result.exit_code).toBe(0);

    const statusErrorEvent = context.emitEvent.mock.calls
      .map(([event]) => event)
      .find((event) => event && event.type === 'status' && event.level === 'error');
    expect(statusErrorEvent).toMatchObject({
      message: 'Command execution threw an exception.',
    });
  });
});
