jest.setTimeout(20000);

// Mock the 'openai' module before requiring the agent so internals use our stub
jest.resetModules();
jest.mock('openai', () => {
  return function OpenAIMock() {
    return {
      responses: {
        create: async () => ({
          output: [
            {
              type: 'message',
              content: [
                {
                  type: 'output_text',
                  text: JSON.stringify({
                    message: 'Mocked response',
                    plan: [],
                    command: {
                      shell: 'bash',
                      run: 'echo "MOCKED_OK"',
                      cwd: '.',
                      timeout_sec: 5
                    }
                  })
                }
              ]
            }
          ]
        })
      }
    };
  };
});

const agent = require('../index.js');

test('agent loop (in-process) with mocked OpenAI and mocked readline flows once and exits (module mock)', async () => {
  // Force auto-approval to avoid interactive approval prompts in tests
  agent.STARTUP_FORCE_AUTO_APPROVE = true;

  // Provide a mock readline interface that returns two inputs: the user prompt and then 'exit'
  const answers = ['Run the test command', 'exit'];
  agent.createInterface = () => ({
    question: (prompt, cb) => {
      const ans = answers.shift() || '';
      setImmediate(() => cb(ans));
    },
    close: () => {}
  });

  // Prevent the CLI thinking animation timers from running
  agent.startThinking = () => {};
  agent.stopThinking = () => {};

  // Prevent actual spawning by replacing runCommand with a fast resolved result
  agent.runCommand = async (cmd, cwd, timeoutSec) => {
    return { stdout: 'MOCKED_OK\n', stderr: '', exit_code: 0, killed: false, runtime_ms: 5 };
  };

  // Run agentLoop; it should process the mocked flow and exit when 'exit' is provided
  await agent.agentLoop();

  // If we reach here without throwing, assume success.
  expect(true).toBe(true);
});
