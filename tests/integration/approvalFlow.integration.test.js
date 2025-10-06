import { jest } from '@jest/globals';

jest.setTimeout(20000);

const mockAnswersQueue = [];

async function loadAgent({ firstPayload, secondPayload }) {
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
                    message: 'Handshake',
                    plan: [],
                    command: null,
                  }
                : callCount === 2
                ? firstPayload
                : secondPayload;

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

describe('Approval flow integration', () => {
  beforeEach(() => {
    mockAnswersQueue.length = 0;
  });

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

    const agent = await loadAgent({ firstPayload, secondPayload });
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

    const outputProcessor = (async () => {
      for await (const event of runtime.outputs) {
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

    const agent = await loadAgent({ firstPayload, secondPayload });
    const runCommandMock = jest.fn();

    const runtime = agent.createAgentRuntime({
      getAutoApproveFlag: () => false,
      runCommandFn: runCommandMock,
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

    mockAnswersQueue.push('Attempt command', '3', 'exit');

    await runtime.start();
    await outputProcessor;

    expect(runCommandMock).not.toHaveBeenCalled();
    expect(prompts[1]).toContain('Approve running this command?');
  });
});
