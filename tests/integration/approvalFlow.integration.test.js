import { jest } from '@jest/globals';

jest.setTimeout(20000);

// Queue feeding mocked OpenAI completions so the loop exercises real pass logic without network calls.
const completionQueue = [];
const requestModelCompletionMock = jest.fn(async () => {
  if (completionQueue.length === 0) {
    throw new Error('No mock completion queued');
  }
  const payload = completionQueue.shift();
  if (payload && payload.status === 'canceled') {
    return { status: 'canceled' };
  }
  return {
    status: 'success',
    completion: {
      output: [
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: JSON.stringify(payload),
            },
          ],
        },
      ],
    },
  };
});

function queueCompletion(payload) {
  completionQueue.push(payload);
}

const mockAnswersQueue = [];
const mockInterface = {
  question: jest.fn((prompt, cb) => {
    const next = mockAnswersQueue.shift() || '';
    process.nextTick(() => cb(next));
  }),
  close: jest.fn(),
};

async function loadAgent() {
  jest.resetModules();

  const createInterface = jest.fn(() => mockInterface);
  const clearLine = jest.fn();
  const cursorTo = jest.fn();

  jest.unstable_mockModule('node:readline', () => ({
    default: { createInterface, clearLine, cursorTo },
    createInterface,
    clearLine,
    cursorTo,
  }));

  const detachMock = jest.fn();
  const createEscStateMock = jest.fn(() => ({
    state: { triggered: false, payload: null, waiters: new Set() },
    detach: detachMock,
  }));
  const createEscWaiterMock = jest.fn(() => ({ promise: Promise.resolve(null), cleanup: jest.fn() }));

  jest.unstable_mockModule('../../src/agent/escState.js', () => ({
    createEscState: createEscStateMock,
    createEscWaiter: createEscWaiterMock,
    resetEscState: jest.fn(),
  }));

  jest.unstable_mockModule('../../src/agent/openaiRequest.js', () => ({
    requestModelCompletion: requestModelCompletionMock,
  }));

  jest.unstable_mockModule('../../src/openai/client.js', () => {
    const getOpenAIClient = jest.fn(() => ({ responses: {} }));
    const resetOpenAIClient = jest.fn();
    const MODEL = 'mock-model';
    return {
      getOpenAIClient,
      resetOpenAIClient,
      MODEL,
      default: { getOpenAIClient, resetOpenAIClient, MODEL },
    };
  });

  jest.unstable_mockModule('dotenv/config', () => ({}));

  const agentModule = await import('../../index.js');
  return { agent: agentModule.default, createEscStateMock, createEscWaiterMock, detachMock };
}

beforeEach(() => {
  mockAnswersQueue.length = 0;
  completionQueue.length = 0;
  mockInterface.question.mockClear();
  mockInterface.close.mockClear();
  requestModelCompletionMock.mockClear();
});

describe('Approval flow integration', () => {
  test('executes command after human approves once', async () => {
    process.env.OPENAI_API_KEY = 'test-key';

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

    const { agent, createEscStateMock, createEscWaiterMock, detachMock } = await loadAgent();
    agent.STARTUP_FORCE_AUTO_APPROVE = false;

    queueCompletion({ message: 'Handshake', plan: [], command: null });
    queueCompletion(firstPayload);
    queueCompletion(secondPayload);

    mockAnswersQueue.push('Please run the command', '1', 'exit');

    agent.startThinking = () => {};
    agent.stopThinking = () => {};

    const runCommandMock = jest.fn().mockResolvedValue({
      stdout: 'APPROVED\n',
      stderr: '',
      exit_code: 0,
      killed: false,
      runtime_ms: 1,
    });
    agent.runCommand = runCommandMock;

    await agent.agentLoop();

    expect(createEscStateMock).toHaveBeenCalledTimes(1);
    expect(detachMock).toHaveBeenCalledTimes(1);
    expect(runCommandMock).toHaveBeenCalledTimes(1);
    expect(mockInterface.question.mock.calls[1][0]).toContain('Approve running this command?');
    expect(mockInterface.close).toHaveBeenCalled();
  });

  test('skips command execution when human rejects', async () => {
    process.env.OPENAI_API_KEY = 'test-key';

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

    const { agent, createEscStateMock, createEscWaiterMock, detachMock } = await loadAgent();
    agent.STARTUP_FORCE_AUTO_APPROVE = false;

    queueCompletion({ message: 'Handshake', plan: [], command: null });
    queueCompletion(firstPayload);
    queueCompletion(secondPayload);

    mockAnswersQueue.push('Attempt command', '3', 'exit');

    agent.startThinking = () => {};
    agent.stopThinking = () => {};

    const runCommandMock = jest.fn();
    agent.runCommand = runCommandMock;

    await agent.agentLoop();

    expect(createEscStateMock).toHaveBeenCalledTimes(1);
    expect(detachMock).toHaveBeenCalledTimes(1);
    expect(runCommandMock).not.toHaveBeenCalled();
    expect(mockInterface.question.mock.calls[1][0]).toContain('Approve running this command?');
    expect(mockInterface.close).toHaveBeenCalled();
  });
});
