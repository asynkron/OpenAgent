import { jest } from '@jest/globals';

import {
  loadAgentWithMockedModules,
  queueModelResponse,
  resetQueuedResponses,
} from './agentRuntimeTestHarness.js';

jest.setTimeout(20000);

const mockAnswersQueue = [];

function queueAnswer(answer) {
  mockAnswersQueue.push(answer);
}

beforeEach(() => {
  mockAnswersQueue.length = 0;
  resetQueuedResponses();
});

test('agent runtime executes one mocked command then exits on user request', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  const { agent } = await loadAgentWithMockedModules();
  agent.STARTUP_FORCE_AUTO_APPROVE = true;

  queueModelResponse({
    message: 'Mocked handshake',
    plan: [],
    command: null,
  });
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

  const observedEvents = [];

  const outputProcessor = (async () => {
    for await (const event of runtime.outputs) {
      observedEvents.push(event);
      if (event.type === 'request-input') {
        const next = mockAnswersQueue.shift() || '';
        runtime.submitPrompt(next);
      }
    }
  })();

  queueAnswer('Run the test command');
  queueAnswer('exit');

  await runtime.start();
  await outputProcessor;

  expect(runCommandMock).toHaveBeenCalledTimes(1);
  const commandEvent = observedEvents.find((evt) => evt.type === 'command-result');
  expect(commandEvent).toBeTruthy();
});
