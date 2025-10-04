jest.setTimeout(20000);

const mockAnswersQueue = [];
const mockInterface = {
  question: jest.fn((prompt, cb) => {
    const next = mockAnswersQueue.shift() || '';
    process.nextTick(() => cb(next));
  }),
  close: jest.fn()
};

jest.resetModules();
jest.mock('readline', () => ({
  createInterface: jest.fn(() => mockInterface),
  clearLine: jest.fn(),
  cursorTo: jest.fn()
}));

jest.mock('openai', () => {
  let mockCallCount = 0;
  return function OpenAIMock() {
    return {
      responses: {
        create: async () => {
          mockCallCount += 1;
          const payload = mockCallCount === 1
            ? {
                message: 'Mocked response',
                plan: [],
                command: {
                  shell: 'bash',
                  run: 'echo "MOCKED_OK"',
                  cwd: '.',
                  timeout_sec: 5
                }
              }
            : {
                message: 'Mocked follow-up',
                plan: [],
                command: null
              };

          return {
            output: [
              {
                type: 'message',
                content: [
                  {
                    type: 'output_text',
                    text: JSON.stringify(payload)
                  }
                ]
              }
            ]
          };
        }
      }
    };
  };
});

const agent = require('../../index.js');

test('agent loop executes one mocked command then exits on user request', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
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
    runtime_ms: 5
  });
  agent.runCommand = runCommandMock;

  await agent.agentLoop();

  expect(runCommandMock).toHaveBeenCalledTimes(1);
  expect(mockInterface.close).toHaveBeenCalled();
});
