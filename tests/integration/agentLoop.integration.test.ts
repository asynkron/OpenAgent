import { jest } from '@jest/globals';

import { queueModelResponse, queueModelCompletion, resetQueuedResponses } from './agentRuntimeTestHarness.js';
import { bootTestCLI } from './utils/cliTestHarness.js';
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
  const runCommandMock = jest.fn().mockResolvedValue({
    stdout: 'MOCKED_OK\n',
    stderr: '',
    exit_code: 0,
    killed: false,
    runtime_ms: 5,
  });

  const { ui } = await bootTestCLI({
    autoApprove: true,
    runtime: { runCommandFn: runCommandMock },
  });

  queueModelResponse({
    message: 'Mocked response',
    plan: [
      {
        id: 'plan-step-execute',
        title: 'Execute mocked command',
        status: 'pending',
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
  ui.queueUserInput('Run the test command', 'exit');

  await ui.start();

  expect(runCommandMock).toHaveBeenCalledTimes(1);
  const commandEvent = ui.events.find((evt) => evt.type === 'command-result');
  expect(commandEvent).toBeTruthy();
});

test('agent runtime executes nested shell commands from raw response strings', async () => {
  const runCommandMock = jest.fn().mockResolvedValue({
    stdout: 'hello\n',
    stderr: '',
    exit_code: 0,
    killed: false,
    runtime_ms: 1,
  });

  const { ui } = await bootTestCLI({
    autoApprove: true,
    runtime: { runCommandFn: runCommandMock },
  });

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
  ui.queueUserInput('Run the raw command', 'exit');

  await ui.start();

  const errorEvents = ui.events.filter((event) => event.type === 'error');
  expect(errorEvents).toHaveLength(0);
  expect(runCommandMock).toHaveBeenCalledTimes(1);
  expect(runCommandMock).toHaveBeenCalledWith('echo hello', '.', 60, '/bin/bash');
});

const _driveRefusalAutoResponse = async (refusalMessage) => {
  const { mocks, ui } = await bootTestCLI();

  // The first response simulates the model refusing; the second proves we nudged it to try again.
  queueModelResponse({
    message: refusalMessage,
    plan: [],
  });
  queueModelResponse({
    message: 'Second attempt succeeds.',
    plan: [],
  });
  ui.queueUserInput('Please try something else', 'exit');

  await ui.start();

  return { mocks, ui };
};
