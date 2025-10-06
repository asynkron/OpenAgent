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

test('agent runtime invokes runRead for read commands', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  const { agent } = await loadAgentWithMockedModules();
  agent.STARTUP_FORCE_AUTO_APPROVE = true;

  queueModelResponse({
    message: 'Mocked handshake',
    plan: [],
    command: null,
  });
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

  const outputProcessor = (async () => {
    for await (const event of runtime.outputs) {
      if (event.type === 'request-input') {
        const next = mockAnswersQueue.shift() || '';
        runtime.submitPrompt(next);
      }
    }
  })();

  mockAnswersQueue.push('Read sample file', 'exit');

  await runtime.start();
  await outputProcessor;

  expect(runReadMock).toHaveBeenCalledTimes(1);
  expect(runReadMock).toHaveBeenCalledWith({ path: 'sample.txt', encoding: 'utf8' }, '.');
  expect(runCommandMock).not.toHaveBeenCalled();
});
