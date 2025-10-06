import { jest } from '@jest/globals';

import {
  loadAgentWithMockedModules,
  queueModelResponse,
  resetQueuedResponses,
} from './agentRuntimeTestHarness.js';

jest.setTimeout(20000);

const mockAnswersQueue = [];

beforeEach(() => {
  mockAnswersQueue.length = 0;
  resetQueuedResponses();
});

test('runtime delegates escape_string command to runEscapeString', async () => {
  process.env.OPENAI_API_KEY = 'test-key';

  const { agent } = await loadAgentWithMockedModules();
  agent.STARTUP_FORCE_AUTO_APPROVE = true;

  queueModelResponse({
    message: 'Handshake',
    plan: [],
    command: null,
  });
  queueModelResponse({
    message: 'Mocked escape command',
    plan: [],
    command: {
      escape_string: { text: 'Needs escaping"\n' },
      cwd: '.',
    },
  });
  queueModelResponse({
    message: 'Follow-up',
    plan: [],
    command: null,
  });

  mockAnswersQueue.push('escape this', 'exit');

  const runEscapeStringMock = jest.fn().mockResolvedValue({
    stdout: '"Needs escaping\\"\\n"',
    stderr: '',
    exit_code: 0,
    killed: false,
    runtime_ms: 2,
  });
  const runCommandMock = jest.fn();

  const runtime = agent.createAgentRuntime({
    getAutoApproveFlag: () => agent.STARTUP_FORCE_AUTO_APPROVE,
    runEscapeStringFn: runEscapeStringMock,
    runCommandFn: runCommandMock,
  });

  const outputProcessor = (async () => {
    for await (const event of runtime.outputs) {
      if (event.type === 'request-input') {
        const next = mockAnswersQueue.shift() || '';
        runtime.submitPrompt(next);
      }
    }
  })();

  await runtime.start();
  await outputProcessor;

  expect(runEscapeStringMock).toHaveBeenCalledTimes(1);
  expect(runEscapeStringMock).toHaveBeenCalledWith({ text: 'Needs escaping"\n' }, '.');
  expect(runCommandMock).not.toHaveBeenCalled();
});

test('runtime delegates unescape_string command to runUnescapeString', async () => {
  process.env.OPENAI_API_KEY = 'test-key';

  const { agent } = await loadAgentWithMockedModules();
  agent.STARTUP_FORCE_AUTO_APPROVE = true;

  queueModelResponse({
    message: 'Handshake',
    plan: [],
    command: null,
  });
  queueModelResponse({
    message: 'Mocked unescape command',
    plan: [],
    command: {
      unescape_string: { text: '"hello\\nworld"' },
      cwd: '.',
    },
  });
  queueModelResponse({
    message: 'Follow-up',
    plan: [],
    command: null,
  });

  mockAnswersQueue.push('unescape this', 'exit');

  const runUnescapeStringMock = jest.fn().mockResolvedValue({
    stdout: 'hello\nworld',
    stderr: '',
    exit_code: 0,
    killed: false,
    runtime_ms: 3,
  });
  const runCommandMock = jest.fn();

  const runtime = agent.createAgentRuntime({
    getAutoApproveFlag: () => agent.STARTUP_FORCE_AUTO_APPROVE,
    runUnescapeStringFn: runUnescapeStringMock,
    runCommandFn: runCommandMock,
  });

  const outputProcessor = (async () => {
    for await (const event of runtime.outputs) {
      if (event.type === 'request-input') {
        const next = mockAnswersQueue.shift() || '';
        runtime.submitPrompt(next);
      }
    }
  })();

  await runtime.start();
  await outputProcessor;

  expect(runUnescapeStringMock).toHaveBeenCalledTimes(1);
  expect(runUnescapeStringMock).toHaveBeenCalledWith({ text: '"hello\\nworld"' }, '.');
  expect(runCommandMock).not.toHaveBeenCalled();
});
