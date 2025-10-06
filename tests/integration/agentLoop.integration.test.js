import { jest } from '@jest/globals';

jest.setTimeout(20000);

const mockAnswersQueue = [];

async function loadAgent() {
  jest.resetModules();

  const createInterface = jest.fn(() => ({
    on: jest.fn(),
    off: jest.fn(),
    close: jest.fn(),
  }));
  const clearLine = jest.fn();
  const cursorTo = jest.fn();

  jest.unstable_mockModule('node:readline', () => ({
    default: { createInterface, clearLine, cursorTo },
    createInterface,
    clearLine,
    cursorTo,
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
  return agentModule.default;
}

function queueAnswer(answer) {
  mockAnswersQueue.push(answer);
}

test('agent runtime executes one mocked command then exits on user request', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  const agent = await loadAgent();
  agent.STARTUP_FORCE_AUTO_APPROVE = true;
  mockAnswersQueue.length = 0;

  const runCommandMock = jest.fn().mockResolvedValue({
    stdout: 'MOCKED_OK\n',
    stderr: '',
    exit_code: 0,
    killed: false,
    runtime_ms: 5,
  });

  const runtime = agent.createAgentRuntime({
    getAutoApproveFlag: () => agent.STARTUP_FORCE_AUTO_APPROVE,
    runCommandFn: runCommandMock,
  });

  const observedEvents = [];

  const outputProcessor = (async () => {
    for await (const event of runtime.outputs) {
      observedEvents.push(event);
      if (event.type === 'request-input') {
        const next = mockAnswersQueue.shift() || '';
        runtime.submitPrompt(next);
      }
    }
  })();

  queueAnswer('Run the test command');
  queueAnswer('exit');

  await runtime.start();
  await outputProcessor;

  expect(runCommandMock).toHaveBeenCalledTimes(1);
  const commandEvent = observedEvents.find((evt) => evt.type === 'command-result');
  expect(commandEvent).toBeTruthy();
});
