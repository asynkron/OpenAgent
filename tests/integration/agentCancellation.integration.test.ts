import { jest } from '@jest/globals';

import { queueModelResponse, resetQueuedResponses } from './agentRuntimeTestHarness.js';
import { bootTestCLI } from './utils/cliTestHarness.js';
import { cancel as cancelActive } from '../../packages/core/dist/src/utils/cancellation.js';

const PLAN_STEP_TITLES = {
  gather: 'Review instructions and constraints',
  execute: 'Run long command',
};

const DEFAULT_SHELL = '/bin/bash';

function withDefaultCommand(command, fallbackRun) {
  const base = {
    shell: DEFAULT_SHELL,
    run: fallbackRun,
    cwd: '.',
    timeout_sec: 30,
  };

  if (!command) {
    return base;
  }

  return { ...base, ...command };
}

function buildPlan(statusGather, statusExecute, command = null) {
  return [
    {
      id: 'plan-step-gather',
      title: PLAN_STEP_TITLES.gather,
      status: statusGather,
      command: withDefaultCommand(null, 'echo "gathering context"'),
    },
    {
      id: 'plan-step-execute',
      title: PLAN_STEP_TITLES.execute,
      status: statusExecute,
      command: withDefaultCommand(command, 'echo "pending execution"'),
    },
  ];
}

function enqueueHandshakeResponse() {
  const plan = buildPlan('completed', 'pending');
  plan[1].waitingForId = ['await-human'];
  queueModelResponse({
    message: 'Handshake ready',
    plan,
  });
}

function enqueueFollowUp(message, statusExecute) {
  queueModelResponse({
    message,
    plan: buildPlan('completed', statusExecute),
  });
}

jest.setTimeout(20000);

beforeEach(() => {
  resetQueuedResponses();
  cancelActive();
});

afterEach(() => {
  cancelActive();
});

test('ESC cancellation aborts an in-flight command and surfaces UI feedback', async () => {
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

  const { ui } = await bootTestCLI({
    autoApprove: true,
    runtime: {
      runCommandFn: runCommandMock,
      emitAutoApproveStatus: true,
    },
  });

  enqueueHandshakeResponse();
  const executionPlan = buildPlan('completed', 'pending', {
    shell: 'bash',
    run: 'sleep 30',
  });
  queueModelResponse({
    message: 'Preparing to run command',
    plan: executionPlan,
  });

  enqueueFollowUp('Command canceled acknowledgement', 'completed');

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
  expect(runCommandMock).toHaveBeenCalledWith('sleep 30', '.', 30, 'bash');
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
