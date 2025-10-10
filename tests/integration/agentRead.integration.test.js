import { jest } from '@jest/globals';

import {
  loadAgentWithMockedModules,
  queueModelResponse,
  resetQueuedResponses,
} from './agentRuntimeTestHarness.js';
import { createTestRunnerUI } from './testRunnerUI.js';
import { extractReadSpecFromCommand } from '../../src/commands/read.js';

jest.setTimeout(20000);

beforeEach(() => {
  resetQueuedResponses();
});

test('agent runtime normalizes read commands to script execution', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  const { agent } = await loadAgentWithMockedModules();
  agent.STARTUP_FORCE_AUTO_APPROVE = true;

  queueModelResponse({
    message: 'Mocked read response',
    plan: [],
    command: {
      run: 'read sample.txt --encoding utf8',
      cwd: '.',
    },
  });
  queueModelResponse({
    message: 'Mocked follow-up',
    plan: [],
    command: null,
  });

  const runCommandMock = jest.fn().mockResolvedValue({
    stdout: 'sample content',
    stderr: '',
    exit_code: 0,
    killed: false,
    runtime_ms: 2,
  });

  const runtime = agent.createAgentRuntime({
    getAutoApproveFlag: () => agent.STARTUP_FORCE_AUTO_APPROVE,
    runCommandFn: runCommandMock,
  });

  const ui = createTestRunnerUI(runtime);
  ui.queueUserInput('Read sample file', 'exit');

  await ui.start();

  expect(runCommandMock).toHaveBeenCalledTimes(1);
  const [normalizedRun, cwdArg] = runCommandMock.mock.calls[0];
  expect(cwdArg).toBe('.');
  expect(normalizedRun.startsWith('node scripts/read.mjs --spec-base64')).toBe(true);
  expect(extractReadSpecFromCommand(normalizedRun)).toEqual({
    path: 'sample.txt',
    encoding: 'utf8',
  });
});
