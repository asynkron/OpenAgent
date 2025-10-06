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

async function loadAgent({ firstPayload, secondPayload }) {
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
  return { agent: agentModule.default, createEscStateMock, detachMock };
}

describe('Approval flow integration', () => {
  beforeEach(() => {
    mockAnswersQueue.length = 0;
    mockInterface.question.mockClear();
    mockInterface.close.mockClear();
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

    const { agent, createEscStateMock, createEscWaiterMock, detachMock } = await loadAgent({ firstPayload, secondPayload });
    agent.STARTUP_FORCE_AUTO_APPROVE = false;

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

    const { agent, createEscStateMock, createEscWaiterMock, detachMock } = await loadAgent({ firstPayload, secondPayload });
    agent.STARTUP_FORCE_AUTO_APPROVE = false;

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
