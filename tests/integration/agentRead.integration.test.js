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

  let callCount = 0;
  jest.unstable_mockModule('openai', () => ({
    default: function OpenAIMock() {
      return {
        responses: {
          create: async () => {
            callCount += 1;
            const payload =
              callCount === 1
                ? {
                    message: 'Mocked handshake',
                    plan: [],
                    command: null,
                  }
                : callCount === 2
                ? {
                    message: 'Mocked read response',
                    plan: [],
                    command: {
                      read: {
                        path: 'sample.txt',
                        encoding: 'utf8',
                      },
                      cwd: '.',
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

test('agent loop invokes runRead for read commands', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  const { agent, createEscStateMock, detachMock } = await loadAgent();
  agent.STARTUP_FORCE_AUTO_APPROVE = true;

  mockAnswersQueue.length = 0;
  mockAnswersQueue.push('Read sample file', 'exit');
  mockInterface.question.mockClear();
  mockInterface.close.mockClear();

  agent.startThinking = () => {};
  agent.stopThinking = () => {};

  const runReadMock = jest.fn().mockResolvedValue({
    stdout: 'sample content',
    stderr: '',
    exit_code: 0,
    killed: false,
    runtime_ms: 2,
  });
  agent.runRead = runReadMock;
  agent.runCommand = jest.fn();

  await agent.agentLoop();

  expect(createEscStateMock).toHaveBeenCalledTimes(1);
  expect(detachMock).toHaveBeenCalledTimes(1);
  expect(runReadMock).toHaveBeenCalledTimes(1);
  expect(runReadMock).toHaveBeenCalledWith({ path: 'sample.txt', encoding: 'utf8' }, '.');
  expect(agent.runCommand).not.toHaveBeenCalled();
  expect(mockInterface.close).toHaveBeenCalled();
});
