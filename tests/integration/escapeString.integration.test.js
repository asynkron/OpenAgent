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

  const ui = createTestRunnerUI(runtime);
  ui.queueUserInput('escape this', 'exit');

  await ui.start();

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

  const ui = createTestRunnerUI(runtime);
  ui.queueUserInput('unescape this', 'exit');

  await ui.start();

  expect(runUnescapeStringMock).toHaveBeenCalledTimes(1);
  expect(runUnescapeStringMock).toHaveBeenCalledWith({ text: '"hello\\nworld"' }, '.');
  expect(runCommandMock).not.toHaveBeenCalled();
});
