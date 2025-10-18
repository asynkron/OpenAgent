import { jest } from '@jest/globals';

import { queueModelResponse, resetQueuedResponses } from './agentRuntimeTestHarness.js';
import { bootTestCLI } from './utils/cliTestHarness.js';
import { createPlanBuilder } from './utils/planBuilder.js';

const planBuilder = createPlanBuilder({
  gather: {
    title: 'Review instructions and constraints',
    fallbackRun: 'echo "gathering context"',
  },
  execute: {
    title: 'Execute requested command',
    fallbackRun: 'echo "waiting for approval"',
  },
  commandDefaults: {
    shell: '/bin/bash',
    cwd: '.',
    timeoutSec: 5,
  },
  handshakeMessage: 'Handshake',
});

function enqueueHandshakeResponse() {
  planBuilder.enqueueHandshake();
}

jest.setTimeout(20000);

beforeEach(() => {
  resetQueuedResponses();
});

describe('Approval flow integration', () => {
  test('executes command after human approves once', async () => {
    const runCommandMock = jest.fn().mockResolvedValue({
      stdout: 'APPROVED\n',
      stderr: '',
      exit_code: 0,
      killed: false,
      runtime_ms: 1,
    });

    const { ui } = await bootTestCLI({
      runtime: {
        getAutoApproveFlag: () => false,
        runCommandFn: runCommandMock,
      },
    });

    enqueueHandshakeResponse();

    const firstPayload = {
      message: 'Needs approval',
      plan: planBuilder.buildPlan('completed', 'pending', {
        run: 'echo "APPROVED"',
      }),
    };
    const secondPayload = {
      message: 'Follow-up',
      plan: planBuilder.buildPlan('completed', 'completed'),
    };

    queueModelResponse(firstPayload);
    queueModelResponse(secondPayload);

    ui.queueUserInput('Please run the command');
    ui.queueApprovalResponse('1');
    ui.queueUserInput('exit');

    await ui.start();

    expect(runCommandMock).toHaveBeenCalledTimes(1);
    const prompts = ui.events
      .filter((event) => event.type === 'request-input')
      .map((event) => event.prompt);
    const statuses = ui.events
      .filter((event) => event.type === 'status')
      .map((event) => event.message);
    expect(prompts[1]).toContain('Approve running this command?');
    expect(statuses.some((msg) => msg && msg.includes('approved for single execution'))).toBe(true);
  });

  test('skips command execution when human rejects', async () => {
    const runCommandMock = jest.fn().mockResolvedValue({
      stdout: '',
      stderr: '',
      exit_code: 0,
      killed: false,
      runtime_ms: 0,
    });

    const { ui } = await bootTestCLI({
      runtime: {
        getAutoApproveFlag: () => false,
        runCommandFn: runCommandMock,
      },
    });

    enqueueHandshakeResponse();

    const firstPayload = {
      message: 'Needs approval',
      plan: planBuilder.buildPlan('completed', 'pending', {
        run: 'echo "SHOULD_NOT_RUN"',
      }),
    };
    const secondPayload = {
      message: 'Alternative requested',
      plan: planBuilder.buildPlan('completed', 'completed'),
    };

    queueModelResponse(firstPayload);
    queueModelResponse(secondPayload);

    ui.queueUserInput('Attempt command');
    ui.queueApprovalResponse('3', '3');
    ui.queueUserInput('exit');

    await ui.start();

    expect(runCommandMock).not.toHaveBeenCalled();
    const prompts = ui.events
      .filter((event) => event.type === 'request-input')
      .map((event) => event.prompt);
    const statuses = ui.events
      .filter((event) => event.type === 'status')
      .map((event) => event.message);
    expect(prompts[1]).toContain('Approve running this command?');
    expect(statuses.some((msg) => msg && msg.includes('canceled by human'))).toBe(true);
  });

  test('auto-approves commands flagged as preapproved', async () => {
    const runCommandMock = jest.fn().mockResolvedValue({
      stdout: 'ok\n',
      stderr: '',
      exit_code: 0,
      killed: false,
      runtime_ms: 1,
    });

    const { ui } = await bootTestCLI({
      runtime: {
        getAutoApproveFlag: () => false,
        runCommandFn: runCommandMock,
        isPreapprovedCommandFn: () => true,
      },
    });

    enqueueHandshakeResponse();

    const preapprovedCommand = {
      message: 'Preapproved command incoming',
      plan: planBuilder.buildPlan('completed', 'pending', {
        run: 'npm test',
      }),
    };

    queueModelResponse(preapprovedCommand);
    queueModelResponse({
      message: 'Follow-up',
      plan: planBuilder.buildPlan('completed', 'completed'),
    });
    ui.queueUserInput('Please handle this', 'exit');

    await ui.start();

    expect(runCommandMock).toHaveBeenCalledTimes(1);
    const prompts = ui.events
      .filter((event) => event.type === 'request-input')
      .map((event) => event.prompt);
    expect(
      prompts.some((prompt) => prompt && prompt.includes('Approve running this command?')),
    ).toBe(false);
  });
});
