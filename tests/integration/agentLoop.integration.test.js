jest.setTimeout(20000);

jest.resetModules();
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

test('agent loop (in-process) with mocked OpenAI and mocked readline flows once and exits (module mock)', async () => {
  agent.STARTUP_FORCE_AUTO_APPROVE = true;

  const answers = ['Run the test command', 'exit'];
  agent.createInterface = () => ({
    question: (prompt, cb) => {
      const ans = answers.shift() || '';
      setImmediate(() => cb(ans));
    },
    close: () => {}
  });

  agent.startThinking = () => {};
  agent.stopThinking = () => {};

  agent.runCommand = async (cmd, cwd, timeoutSec) => {
    return { stdout: 'MOCKED_OK\n', stderr: '', exit_code: 0, killed: false, runtime_ms: 5 };
  };

  await agent.agentLoop();

  expect(true).toBe(true);
});
