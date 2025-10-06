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

  let mockCallCount = 0;
  jest.unstable_mockModule('openai', () => ({
    default: function OpenAIMock() {
      return {
        responses: {
          create: async () => {
            mockCallCount += 1;
            const payload =
              mockCallCount === 1
                ? {
                    message: 'Mocked handshake',
                    plan: [],
                    command: null,
                  }
                : mockCallCount === 2
                ? {
                    message: 'Mocked response',
                    plan: [],
                    command: {
                      shell: 'bash',
                      run: 'echo "MOCKED_OK"',
                      cwd: '.',
                      timeout_sec: 5,
                    },
                  }
                : {
                    message: 'Mocked follow-up',
                    plan: [],
                    command: null,
                  };

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
  return { agent: agentModule.default, createEscStateMock, detachMock };
}

test('agent loop executes one mocked command then exits on user request', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  const { agent, createEscStateMock, detachMock } = await loadAgent();
  agent.STARTUP_FORCE_AUTO_APPROVE = true;

  mockAnswersQueue.length = 0;
  mockAnswersQueue.push('Run the test command', 'exit');
  mockInterface.question.mockClear();
  mockInterface.close.mockClear();

  agent.startThinking = () => {};
  agent.stopThinking = () => {};

  const runCommandMock = jest.fn().mockResolvedValue({
    stdout: 'MOCKED_OK\n',
    stderr: '',
    exit_code: 0,
    killed: false,
    runtime_ms: 5,
  });
  agent.runCommand = runCommandMock;

  await agent.agentLoop();

  expect(createEscStateMock).toHaveBeenCalledTimes(1);
  expect(runCommandMock).toHaveBeenCalledTimes(1);
  expect(detachMock).toHaveBeenCalledTimes(1);
  expect(mockInterface.close).toHaveBeenCalled();
});
