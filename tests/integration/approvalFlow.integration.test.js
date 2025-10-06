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

    const prompts = [];
    const statuses = [];

    const outputProcessor = (async () => {
      for await (const event of runtime.outputs) {
        if (event.type === 'status') {
          statuses.push(event.message);
        }
        if (event.type === 'request-input') {
          prompts.push(event.prompt);
          const next = mockAnswersQueue.shift() || '';
          runtime.submitPrompt(next);
        }
      }
    })();

    mockAnswersQueue.push('Please run the command', '1', 'exit');

    await runtime.start();
    await outputProcessor;

    expect(runCommandMock).toHaveBeenCalledTimes(1);
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

    const prompts = [];
    const statuses = [];

    const outputProcessor = (async () => {
      for await (const event of runtime.outputs) {
        if (event.type === 'status') {
          statuses.push(event.message);
        }
        if (event.type === 'request-input') {
          prompts.push(event.prompt);
          const next = mockAnswersQueue.shift() || '';
          runtime.submitPrompt(next);
        }
      }
    })();

    mockAnswersQueue.push('Attempt command', '3', 'exit');

    await runtime.start();
    await outputProcessor;

    expect(runCommandMock).not.toHaveBeenCalled();
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

    const prompts = [];

    const outputProcessor = (async () => {
      for await (const event of runtime.outputs) {
        if (event.type === 'request-input') {
          prompts.push(event.prompt);
          const next = mockAnswersQueue.shift() || '';
          runtime.submitPrompt(next);
        }
      }
    })();

    mockAnswersQueue.push('Please handle this', 'exit');

    await runtime.start();
    await outputProcessor;

    expect(runCommandMock).toHaveBeenCalledTimes(1);
    expect(prompts.some((prompt) => prompt && prompt.includes('Approve running this command?'))).toBe(false);
  });
});
