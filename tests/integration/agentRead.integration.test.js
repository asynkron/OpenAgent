import { jest } from '@jest/globals';

jest.setTimeout(20000);

const mockAnswersQueue = [];

async function loadAgent() {
  jest.resetModules();

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
  return agentModule.default;
}

test('agent runtime invokes runRead for read commands', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  const agent = await loadAgent();
  agent.STARTUP_FORCE_AUTO_APPROVE = true;
  mockAnswersQueue.length = 0;

  const runReadMock = jest.fn().mockResolvedValue({
    stdout: 'sample content',
    stderr: '',
    exit_code: 0,
    killed: false,
    runtime_ms: 2,
  });
  const runCommandMock = jest.fn();

  const runtime = agent.createAgentRuntime({
    getAutoApproveFlag: () => agent.STARTUP_FORCE_AUTO_APPROVE,
    runReadFn: runReadMock,
    runCommandFn: runCommandMock,
  });

  const outputProcessor = (async () => {
    for await (const event of runtime.outputs) {
      if (event.type === 'request-input') {
        const next = mockAnswersQueue.shift() || '';
        runtime.submitPrompt(next);
      }
    }
  })();

  mockAnswersQueue.push('Read sample file', 'exit');

  await runtime.start();
  await outputProcessor;

  expect(runReadMock).toHaveBeenCalledTimes(1);
  expect(runReadMock).toHaveBeenCalledWith({ path: 'sample.txt', encoding: 'utf8' }, '.');
  expect(runCommandMock).not.toHaveBeenCalled();
});
