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

describe('Approval flow integration', () => {
  test('executes command after human approves once', async () => {
    process.env.OPENAI_API_KEY = 'test-key';

    const { agent } = await loadAgentWithMockedModules();

    queueModelResponse({
      message: 'Handshake',
      plan: [],
      command: null,
    });

    const firstPayload = {
      message: 'Needs approval',
      plan: [],
      command: {
        run: 'echo "APPROVED"',
        cwd: '.',
        timeout_sec: 5,
      },
    };
    const secondPayload = { message: 'Follow-up', plan: [], command: null };

    queueModelResponse(firstPayload);
    queueModelResponse(secondPayload);

    const runCommandMock = jest.fn().mockResolvedValue({
      stdout: 'APPROVED\n',
      stderr: '',
      exit_code: 0,
      killed: false,
      runtime_ms: 1,
    });

    const runtime = agent.createAgentRuntime({
      getAutoApproveFlag: () => false,
      runCommandFn: runCommandMock,
    });

    const ui = createTestRunnerUI(runtime);
    ui.queueUserInput('Please run the command');
    ui.queueApprovalResponse('1');
    ui.queueUserInput('exit');

    await ui.start();

    expect(runCommandMock).toHaveBeenCalledTimes(1);
    const prompts = ui.events.filter((event) => event.type === 'request-input').map((event) => event.prompt);
    const statuses = ui.events.filter((event) => event.type === 'status').map((event) => event.message);
    expect(prompts[1]).toContain('Approve running this command?');
    expect(statuses.some((msg) => msg && msg.includes('approved for single execution'))).toBe(true);
  });

  test('skips command execution when human rejects', async () => {
    process.env.OPENAI_API_KEY = 'test-key';

    const { agent } = await loadAgentWithMockedModules();

    queueModelResponse({
      message: 'Handshake',
      plan: [],
      command: null,
    });

    const firstPayload = {
      message: 'Needs approval',
      plan: [],
      command: {
        run: 'echo "SHOULD_NOT_RUN"',
        cwd: '.',
        timeout_sec: 5,
      },
    };
    const secondPayload = { message: 'Alternative requested', plan: [], command: null };

    queueModelResponse(firstPayload);
    queueModelResponse(secondPayload);

    const runCommandMock = jest.fn();

    const runtime = agent.createAgentRuntime({
      getAutoApproveFlag: () => false,
      runCommandFn: runCommandMock,
    });

    const ui = createTestRunnerUI(runtime);
    ui.queueUserInput('Attempt command');
    ui.queueApprovalResponse('3');
    ui.queueUserInput('exit');

    await ui.start();

    expect(runCommandMock).not.toHaveBeenCalled();
    const prompts = ui.events.filter((event) => event.type === 'request-input').map((event) => event.prompt);
    const statuses = ui.events.filter((event) => event.type === 'status').map((event) => event.message);
    expect(prompts[1]).toContain('Approve running this command?');
    expect(statuses.some((msg) => msg && msg.includes('canceled by human'))).toBe(true);
  });

  test('auto-approves commands flagged as preapproved', async () => {
    process.env.OPENAI_API_KEY = 'test-key';

    const { agent } = await loadAgentWithMockedModules();

    queueModelResponse({
      message: 'Handshake',
      plan: [],
      command: null,
    });

    const preapprovedCommand = {
      message: 'Preapproved command incoming',
      plan: [],
      command: {
        run: 'npm test',
        cwd: '.',
        timeout_sec: 5,
      },
    };

    queueModelResponse(preapprovedCommand);
    queueModelResponse({ message: 'Follow-up', plan: [], command: null });

    const runCommandMock = jest.fn().mockResolvedValue({
      stdout: 'ok\n',
      stderr: '',
      exit_code: 0,
      killed: false,
      runtime_ms: 1,
    });

    const runtime = agent.createAgentRuntime({
      getAutoApproveFlag: () => false,
      runCommandFn: runCommandMock,
      isPreapprovedCommandFn: () => true,
    });

    const ui = createTestRunnerUI(runtime);
    ui.queueUserInput('Please handle this', 'exit');

    await ui.start();

    expect(runCommandMock).toHaveBeenCalledTimes(1);
    const prompts = ui.events.filter((event) => event.type === 'request-input').map((event) => event.prompt);
    expect(prompts.some((prompt) => prompt && prompt.includes('Approve running this command?'))).toBe(false);
  });
});
