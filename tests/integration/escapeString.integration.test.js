import { jest } from '@jest/globals';

jest.setTimeout(20000);

const mockAnswersQueue = [];
const mockPayloads = [];

async function loadAgent() {
  jest.resetModules();

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
});

test('runtime delegates escape_string command to runEscapeString', async () => {
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

  const runEscapeStringMock = jest.fn().mockResolvedValue({
    stdout: '"Needs escaping\\"\\n"',
    stderr: '',
    exit_code: 0,
    killed: false,
    runtime_ms: 2,
  });
  const runCommandMock = jest.fn();

  const runtime = agent.createAgentRuntime({
    getAutoApproveFlag: () => agent.STARTUP_FORCE_AUTO_APPROVE,
    runEscapeStringFn: runEscapeStringMock,
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

  await runtime.start();
  await outputProcessor;

  expect(runEscapeStringMock).toHaveBeenCalledTimes(1);
  expect(runEscapeStringMock).toHaveBeenCalledWith({ text: 'Needs escaping"\n' }, '.');
  expect(runCommandMock).not.toHaveBeenCalled();
});

test('runtime delegates unescape_string command to runUnescapeString', async () => {
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

  const runUnescapeStringMock = jest.fn().mockResolvedValue({
    stdout: 'hello\nworld',
    stderr: '',
    exit_code: 0,
    killed: false,
    runtime_ms: 3,
  });
  const runCommandMock = jest.fn();

  const runtime = agent.createAgentRuntime({
    getAutoApproveFlag: () => agent.STARTUP_FORCE_AUTO_APPROVE,
    runUnescapeStringFn: runUnescapeStringMock,
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

  await runtime.start();
  await outputProcessor;

  expect(runUnescapeStringMock).toHaveBeenCalledTimes(1);
  expect(runUnescapeStringMock).toHaveBeenCalledWith({ text: '"hello\\nworld"' }, '.');
  expect(runCommandMock).not.toHaveBeenCalled();
});
