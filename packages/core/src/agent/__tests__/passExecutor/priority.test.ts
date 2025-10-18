/* eslint-env jest */
import { DEFAULT_COMMAND_MAX_BYTES } from '../../../constants.js';
import * as H from './helpers';
Object.assign(globalThis, H);

describe('executeAgentPass', () => {
  test('executes every ready plan step in priority order during a single pass', async () => {
    const commandRuns: string[] = [];
    const {
      executeAgentPass,
      parseAssistantResponse,
      executeAgentCommand,
      planHasOpenSteps,
      planStepIsBlocked,
      buildPlanLookup,
    } = await setupPassExecutor({
      executeAgentCommandImpl: ({ command }) => {
        commandRuns.push(command.run);
        return { result: { stdout: '', stderr: '', exit_code: 0 }, executionDetails: { code: 0 } };
      },
    });

    planHasOpenSteps.mockReturnValue(true);
    buildPlanLookup.mockImplementation(createComplexBuildPlanLookupMock());
    planStepIsBlocked.mockImplementation(createComplexPlanStepIsBlockedMock());

    parseAssistantResponse.mockImplementation(() => ({
      ok: true,
      value: {
        message: 'Executing plan',
        plan: [
          {
            id: 'c',
            title: 'Independent high priority task',
            status: 'pending',
            priority: 1,
            command: { run: 'run-c', max_bytes: DEFAULT_COMMAND_MAX_BYTES },
          },
          {
            id: 'a',
            title: 'Base task',
            status: 'pending',
            priority: 2,
            command: { run: 'run-a', max_bytes: DEFAULT_COMMAND_MAX_BYTES },
          },
          {
            id: 'b',
            title: 'Dependent follow-up',
            status: 'pending',
            priority: 0,
            waitingForId: ['a'],
            command: { run: 'run-b', max_bytes: DEFAULT_COMMAND_MAX_BYTES },
          },
        ],
      },
      recovery: { strategy: 'direct' },
    }));

    const PASS_INDEX = 17;
    const context = createTestContext(PASS_INDEX);
    const result = await executeAgentPass(context);

    expect(result).toBe(true);
    expect(executeAgentCommand).toHaveBeenCalledTimes(3);
    expect(commandRuns).toEqual(['run-c', 'run-a', 'run-b']);
  });
});
