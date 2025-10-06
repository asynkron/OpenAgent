import { jest } from '@jest/globals';

jest.setTimeout(20000);

const mockAnswersQueue = [];
const mockInterface = {
  question: jest.fn((prompt, cb) => {
    const next = mockAnswersQueue.shift() || '';
    process.nextTick(() => cb(next));
  }),
  close: jest.fn(),
};

const mockPayloads = [];

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

  jest.unstable_mockModule('openai', () => ({
    default: function OpenAIMock() {
      return {
        responses: {
          create: async () => {
            if (mockPayloads.length === 0) {
              throw new Error('No mock payload configured');
            }
            const payload = mockPayloads.shift();
            return {
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
            };
          },
        },
      };
    },
  }));

  jest.unstable_mockModule('dotenv/config', () => ({}));

  const agentModule = await import('../../index.js');
  return agentModule.default;
}

beforeEach(() => {
  mockAnswersQueue.length = 0;
  mockPayloads.length = 0;
  mockInterface.question.mockClear();
  mockInterface.close.mockClear();
});

test('agent loop delegates escape_string command to runEscapeString', async () => {
  process.env.OPENAI_API_KEY = 'test-key';

  mockPayloads.push(
    {
      message: 'Handshake',
      plan: [],
      command: null,
    },
    {
      message: 'Mocked escape command',
      plan: [],
      command: {
        escape_string: { text: 'Needs escaping"\n' },
        cwd: '.',
      },
    },
    {
      message: 'Follow-up',
      plan: [],
      command: null,
    },
  );

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

  mockPayloads.push(
    {
      message: 'Handshake',
      plan: [],
      command: null,
    },
    {
      message: 'Mocked unescape command',
      plan: [],
      command: {
        unescape_string: { text: '"hello\\nworld"' },
        cwd: '.',
      },
    },
    {
      message: 'Follow-up',
      plan: [],
      command: null,
    },
  );

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
