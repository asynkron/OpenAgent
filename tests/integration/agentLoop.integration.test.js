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

test('agent runtime emits debug envelopes when debug flag enabled', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  const { agent } = await loadAgentWithMockedModules();
  agent.STARTUP_DEBUG = true;

  queueModelResponse({
    message: 'Debug test response',
    plan: [],
    command: null,
  });

  const runtime = agent.createAgentRuntime({
    getDebugFlag: () => agent.STARTUP_DEBUG,
  });

  const capturedEvents = [];
  const ui = createTestRunnerUI(runtime, {
    onEvent: (event) => {
      if (event?.type === 'debug') {
        capturedEvents.push(event);
      }
    },
  });

  ui.queueUserInput('Trigger debug output', 'exit');

  await ui.start();

  expect(capturedEvents.length).toBeGreaterThan(0);
  const stages = capturedEvents.map((event) => event.payload?.stage);
  expect(stages).toContain('openai-response');
  expect(stages).toContain('assistant-response');
});
