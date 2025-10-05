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
  return agentModule.default;
}

test('agent loop invokes runRead for read commands', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  const agent = await loadAgent();
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

  // Prevent accidental shell execution if something goes wrong.
  agent.runCommand = jest.fn();

  await agent.agentLoop();

  expect(runReadMock).toHaveBeenCalledTimes(1);
  expect(runReadMock).toHaveBeenCalledWith({ path: 'sample.txt', encoding: 'utf8' }, '.');
  expect(agent.runCommand).not.toHaveBeenCalled();
  expect(mockInterface.close).toHaveBeenCalled();
});
