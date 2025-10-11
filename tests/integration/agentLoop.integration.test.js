import { jest } from '@jest/globals';

import {
  loadAgentWithMockedModules,
  queueModelResponse,
  queueModelCompletion,
  resetQueuedResponses,
} from './agentRuntimeTestHarness.js';
import { createTestRunnerUI } from './testRunnerUI.js';
import {
  nestedShellResponseText,
  rawNestedShellResponsePayload,
} from './__fixtures__/openaiNestedShellResponse.js';

jest.setTimeout(20000);

beforeEach(() => {
  resetQueuedResponses();
});

// Sanity-check that the captured payload still mirrors the OpenAI response we
// debugged; a missing `stage` would mean the fixture drifted or parsing failed.
if (!rawNestedShellResponsePayload.includes('"stage": "openai-response"')) {
  throw new Error('OpenAI nested shell response fixture lost its stage metadata.');
}

test('agent runtime executes one mocked command then exits on user request', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  const { agent } = await loadAgentWithMockedModules();
  agent.STARTUP_FORCE_AUTO_APPROVE = true;

  queueModelResponse({
    message: 'Mocked response',
    plan: [
      {
        step: '1',
        title: 'Execute mocked command',
        status: 'running',
        command: {
          shell: 'bash',
          run: 'echo "MOCKED_OK"',
          cwd: '.',
          timeout_sec: 5,
        },
      },
    ],
  });
  queueModelResponse({
    message: 'Mocked follow-up',
    plan: [],
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

test('agent runtime executes nested shell commands from raw response strings', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  const { agent } = await loadAgentWithMockedModules();
  agent.STARTUP_FORCE_AUTO_APPROVE = true;

  queueModelCompletion({
    status: 'success',
    completion: {
      output: [
        {
          type: 'function_call',
          name: 'open-agent',
          call_id: 'fixture-call-1',
          arguments: nestedShellResponseText,
        },
      ],
    },
  });

  queueModelResponse({
    message: 'Mocked follow-up',
    plan: [],
  });

  const runCommandMock = jest.fn().mockResolvedValue({
    stdout: 'hello\n',
    stderr: '',
    exit_code: 0,
    killed: false,
    runtime_ms: 1,
  });

  const runtime = agent.createAgentRuntime({
    getAutoApproveFlag: () => agent.STARTUP_FORCE_AUTO_APPROVE,
    runCommandFn: runCommandMock,
  });

  const ui = createTestRunnerUI(runtime);
  ui.queueUserInput('Run the raw command', 'exit');

  await ui.start();

  const errorEvents = ui.events.filter((event) => event.type === 'error');
  expect(errorEvents).toHaveLength(0);
  expect(runCommandMock).toHaveBeenCalledTimes(1);
  expect(runCommandMock).toHaveBeenCalledWith('echo hello', '.', 60, undefined);
});

const driveRefusalAutoResponse = async (refusalMessage) => {
  process.env.OPENAI_API_KEY = 'test-key';
  const { agent, mocks } = await loadAgentWithMockedModules();

  // The first response simulates the model refusing; the second proves we nudged it to try again.
  queueModelResponse({
    message: refusalMessage,
    plan: [],
  });
  queueModelResponse({
    message: 'Second attempt succeeds.',
    plan: [],
  });

  const runtime = agent.createAgentRuntime();
  const ui = createTestRunnerUI(runtime);
  ui.queueUserInput('Please try something else', 'exit');

  await ui.start();

  return { mocks, ui };
};

test.each([
  'I’m sorry, but I can’t help with that.',
  "I'm sorry, I can't assist with that.",
  'I’m sorry, but I can’t continue with that.',
])('auto-responds with continue when refusal looks like "%s"', async (refusalMessage) => {
  const { mocks, ui } = await driveRefusalAutoResponse(refusalMessage);

  expect(mocks.requestModelCompletion).toHaveBeenCalledTimes(2);
  const secondCall = mocks.requestModelCompletion.mock.calls[1]?.[0] ?? {};
  const assistantMessages = Array.isArray(secondCall.history)
    ? secondCall.history
        .filter((entry) => entry.role === 'assistant')
        .map((entry) => String(entry.content ?? ''))
    : [];
  expect(
    assistantMessages.some((message) =>
      message.toLowerCase().includes('auto-response') && message.includes('continue'),
    ),
  ).toBe(true);

  const autoStatusEvent = ui.events.find(
    (event) =>
      event.type === 'status' &&
      event.level === 'info' &&
      typeof event.message === 'string' &&
      event.message.includes('auto-responding with "continue"'),
  );
  expect(autoStatusEvent).toBeTruthy();
});

test('agent runtime emits debug envelopes when debug flag enabled', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  const { agent } = await loadAgentWithMockedModules();
  agent.STARTUP_DEBUG = true;

  queueModelResponse({
    message: 'Debug test response',
    plan: [],
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

test('protocol validation failures are emitted on the debug channel only', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  const { agent } = await loadAgentWithMockedModules();
  agent.STARTUP_DEBUG = true;

  queueModelResponse({
    message: 'Working through the plan',
    plan: [{ step: '1', title: 'Do the work', status: 'pending' }],
  });

  queueModelResponse({
    message: 'Recovered response',
    plan: [],
  });

  const runtime = agent.createAgentRuntime({
    getDebugFlag: () => agent.STARTUP_DEBUG,
  });

  const debugEvents = [];
  const ui = createTestRunnerUI(runtime, {
    onEvent: (event) => {
      if (event?.type === 'debug') {
        debugEvents.push(event);
      }
    },
  });

  ui.queueUserInput('Trigger invalid response', 'exit');

  await ui.start();

  const debugStages = debugEvents.map((event) => event.payload?.stage);
  expect(debugStages).toContain('assistant-response-validation-error');

  const errorEvents = ui.events.filter((event) => event.type === 'error');
  expect(errorEvents).toHaveLength(0);

  const statusMessages = ui.events
    .filter((event) => event.type === 'status')
    .map((event) => String(event.message ?? ''));
  expect(
    statusMessages.some((message) =>
      message.includes('Assistant response failed protocol validation.'),
    ),
  ).toBe(false);
});
