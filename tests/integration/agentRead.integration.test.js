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

test('agent runtime invokes runRead for read commands', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  const { agent } = await loadAgentWithMockedModules();
  agent.STARTUP_FORCE_AUTO_APPROVE = true;

  queueModelResponse({
    message: 'Mocked read response',
    plan: [],
    command: {
      read: {
        path: 'sample.txt',
        encoding: 'utf8',
      },
      cwd: '.',
    },
  });
  queueModelResponse({
    message: 'Mocked follow-up',
    plan: [],
    command: null,
  });

  const runReadMock = jest.fn().mockResolvedValue({
    stdout: 'sample content',
    stderr: '',
    exit_code: 0,
    killed: false,
    runtime_ms: 2,
  });
  const runCommandMock = jest.fn();

  const runtime = agent.createAgentRuntime({
    getAutoApproveFlag: () => agent.STARTUP_FORCE_AUTO_APPROVE,
    runReadFn: runReadMock,
    runCommandFn: runCommandMock,
  });

  const ui = createTestRunnerUI(runtime);
  ui.queueUserInput('Read sample file', 'exit');

  await ui.start();

  expect(runReadMock).toHaveBeenCalledTimes(1);
  expect(runReadMock).toHaveBeenCalledWith({ path: 'sample.txt', encoding: 'utf8' }, '.');
  expect(runCommandMock).not.toHaveBeenCalled();
});
