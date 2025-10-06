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

  jest.unstable_mockModule('../../src/agent/escState.js', () => ({
    createEscState: jest.fn(() => ({
      state: { triggered: false, payload: null, waiters: new Set() },
      detach: jest.fn(),
    })),
    createEscWaiter: jest.fn(() => ({ promise: Promise.resolve(null), cleanup: jest.fn() })),
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
  return agentModule.default;
}

beforeEach(() => {
  mockAnswersQueue.length = 0;
  completionQueue.length = 0;
  mockInterface.question.mockClear();
  mockInterface.close.mockClear();
  requestModelCompletionMock.mockClear();
});

test('agent loop delegates escape_string command to runEscapeString', async () => {
  process.env.OPENAI_API_KEY = 'test-key';

  queueCompletion({ message: 'Handshake', plan: [], command: null });
  queueCompletion({
    message: 'Mocked escape command',
    plan: [],
    command: {
      escape_string: { text: 'Needs escaping"\n' },
      cwd: '.',
    },
  });
  queueCompletion({ message: 'Follow-up', plan: [], command: null });

  mockAnswersQueue.push('escape this', 'exit');

  const agent = await loadAgent();
  agent.STARTUP_FORCE_AUTO_APPROVE = true;
  agent.startThinking = () => {};
  agent.stopThinking = () => {};

  const runEscapeStringMock = jest.fn().mockResolvedValue({
    stdout: '"Needs escaping\\"\\n"',
    stderr: '',
    exit_code: 0,
    killed: false,
    runtime_ms: 2,
  });

  agent.runEscapeString = runEscapeStringMock;
  agent.runUnescapeString = jest.fn();
  agent.runCommand = jest.fn();

  await agent.agentLoop();

  expect(runEscapeStringMock).toHaveBeenCalledTimes(1);
  expect(runEscapeStringMock).toHaveBeenCalledWith({ text: 'Needs escaping"\n' }, '.');
  expect(agent.runCommand).not.toHaveBeenCalled();
  expect(mockInterface.close).toHaveBeenCalled();
});

test('agent loop delegates unescape_string command to runUnescapeString', async () => {
  process.env.OPENAI_API_KEY = 'test-key';

  queueCompletion({ message: 'Handshake', plan: [], command: null });
  queueCompletion({
    message: 'Mocked unescape command',
    plan: [],
    command: {
      unescape_string: { text: '"hello\\nworld"' },
      cwd: '.',
    },
  });
  queueCompletion({ message: 'Follow-up', plan: [], command: null });

  mockAnswersQueue.push('unescape this', 'exit');

  const agent = await loadAgent();
  agent.STARTUP_FORCE_AUTO_APPROVE = true;
  agent.startThinking = () => {};
  agent.stopThinking = () => {};

  const runUnescapeStringMock = jest.fn().mockResolvedValue({
    stdout: 'hello\nworld',
    stderr: '',
    exit_code: 0,
    killed: false,
    runtime_ms: 3,
  });

  agent.runEscapeString = jest.fn();
  agent.runUnescapeString = runUnescapeStringMock;
  agent.runCommand = jest.fn();

  await agent.agentLoop();

  expect(runUnescapeStringMock).toHaveBeenCalledTimes(1);
  expect(runUnescapeStringMock).toHaveBeenCalledWith({ text: '"hello\\nworld"' }, '.');
  expect(agent.runCommand).not.toHaveBeenCalled();
  expect(mockInterface.close).toHaveBeenCalled();
});
