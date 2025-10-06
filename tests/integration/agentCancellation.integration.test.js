import { jest } from '@jest/globals';

import {
  loadAgentWithMockedModules,
  queueModelResponse,
  resetQueuedResponses,
} from './agentRuntimeTestHarness.js';
import { createTestRunnerUI } from './testRunnerUI.js';
import { cancel as cancelActive } from '../../src/utils/cancellation.js';

jest.setTimeout(20000);

beforeEach(() => {
  resetQueuedResponses();
  cancelActive();
});

afterEach(() => {
  cancelActive();
});

test('ESC cancellation aborts an in-flight command and surfaces UI feedback', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  const { agent } = await loadAgentWithMockedModules();
  agent.STARTUP_FORCE_AUTO_APPROVE = true;

  queueModelResponse({
    message: 'Handshake ready',
    plan: [],
    command: null,
  });

  queueModelResponse({
    message: 'Preparing to run command',
    plan: [],
    command: {
      shell: 'bash',
      run: 'sleep 30',
      cwd: '.',
      timeout_sec: 30,
    },
  });

  queueModelResponse({
    message: 'Command canceled acknowledgement',
    plan: [],
    command: null,
  });

  let cancelCurrentCommand;
  let cancelObserved = false;
  const runCommandMock = jest.fn().mockImplementation(() => {
    let settled = false;
    let timeoutId;

    return new Promise((resolve) => {
      const finalize = (result) => {
        if (settled) {
          return;
        }
        settled = true;
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        cancelCurrentCommand = undefined;
        resolve(result);
      };

      cancelCurrentCommand = () => {
        cancelObserved = true;
        finalize({
          stdout: '',
          stderr: 'Command canceled: ui-cancel',
          exit_code: null,
          killed: true,
          runtime_ms: 0,
        });
      };

      timeoutId = setTimeout(() => {
        finalize({
          stdout: 'completed',
          stderr: '',
          exit_code: 0,
          killed: false,
          runtime_ms: 5,
        });
      }, 500);
    });
  });

  const runtime = agent.createAgentRuntime({
    getAutoApproveFlag: () => agent.STARTUP_FORCE_AUTO_APPROVE,
    runCommandFn: runCommandMock,
  });

  const ui = createTestRunnerUI(runtime);

  ui.addEventListener((event) => {
    if (event.type === 'status' && event.message === 'Command auto-approved via flag.') {
      setTimeout(() => {
        ui.cancel({ reason: 'integration-test-esc' });
      }, 10);
    }

    if (
      event.type === 'status' &&
      event.message === 'Cancellation requested by UI.' &&
      cancelCurrentCommand
    ) {
      cancelCurrentCommand();
    }
  });

  ui.queueUserInput('Please execute a command', 'exit');

  await ui.start();

  expect(runCommandMock).toHaveBeenCalledTimes(1);
  expect(cancelObserved).toBe(true);

  const statusEvent = ui.events.find(
    (event) => event.type === 'status' && event.message === 'Cancellation requested by UI.',
  );
  expect(statusEvent).toBeTruthy();

  const commandResultEvent = ui.events.find((event) => event.type === 'command-result');
  expect(commandResultEvent).toBeTruthy();
  expect(commandResultEvent.result.killed).toBe(true);
  expect(commandResultEvent.result.stderr).toContain('Command canceled: ui-cancel');
});
