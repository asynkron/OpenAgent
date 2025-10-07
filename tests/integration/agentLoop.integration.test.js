import { jest } from '@jest/globals';

import {
  loadAgentWithMockedModules,
  queueModelResponse,
  resetQueuedResponses,
} from './agentRuntimeTestHarness.js';
import { createTestRunnerUI } from './testRunnerUI.js';

jest.setTimeout(20000);

beforeEach(() => {
  resetQueuedResponses();
});

test('agent runtime executes one mocked command then exits on user request', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  const { agent } = await loadAgentWithMockedModules();
  agent.STARTUP_FORCE_AUTO_APPROVE = true;

  queueModelResponse({
    message: 'Mocked response',
    plan: [],
    command: {
      shell: 'bash',
      run: 'echo "MOCKED_OK"',
      cwd: '.',
      timeout_sec: 5,
    },
  });
  queueModelResponse({
    message: 'Mocked follow-up',
    plan: [],
    command: null,
  });

  const runCommandMock = jest.fn().mockResolvedValue({
    stdout: 'MOCKED_OK\n',
    stderr: '',
    exit_code: 0,
    killed: false,
    runtime_ms: 5,
  });

  const runtime = agent.createAgentRuntime({
    getAutoApproveFlag: () => agent.STARTUP_FORCE_AUTO_APPROVE,
    runCommandFn: runCommandMock,
  });

  const ui = createTestRunnerUI(runtime);
  ui.queueUserInput('Run the test command', 'exit');

  await ui.start();

  expect(runCommandMock).toHaveBeenCalledTimes(1);
  const commandEvent = ui.events.find((evt) => evt.type === 'command-result');
  expect(commandEvent).toBeTruthy();
});

const driveRefusalAutoResponse = async (refusalMessage) => {
  process.env.OPENAI_API_KEY = 'test-key';
  const { agent, mocks } = await loadAgentWithMockedModules();

  // The first response simulates the model refusing; the second proves we nudged it to try again.
  queueModelResponse({
    message: refusalMessage,
    plan: [],
    command: null,
  });
  queueModelResponse({
    message: 'Second attempt succeeds.',
    plan: [],
    command: null,
  });

  const runtime = agent.createAgentRuntime();
  const ui = createTestRunnerUI(runtime);
  ui.queueUserInput('Please try something else', 'exit');

  await ui.start();

  return { mocks, ui };
};

test.each([
  "I’m sorry, but I can’t help with that.",
  "I'm sorry, I can't assist with that.",
])('auto-responds with continue when refusal looks like "%s"', async (refusalMessage) => {
  const { mocks, ui } = await driveRefusalAutoResponse(refusalMessage);

  expect(mocks.requestModelCompletion).toHaveBeenCalledTimes(2);
  const secondCall = mocks.requestModelCompletion.mock.calls[1]?.[0] ?? {};
  const userMessages = Array.isArray(secondCall.history)
    ? secondCall.history.filter((entry) => entry.role === 'user').map((entry) => entry.content)
    : [];
  expect(userMessages).toContain('continue');

  const autoStatusEvent = ui.events.find(
    (event) =>
      event.type === 'status' &&
      event.level === 'info' &&
      typeof event.message === 'string' &&
      event.message.includes('auto-responding with "continue"')
  );
  expect(autoStatusEvent).toBeTruthy();
});
