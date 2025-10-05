// Preload mock for 'openai' module so the agent uses our stubbed client
const Module = require('module');
const originalLoad = Module._load;
Module._load = function (request, _parent, _isMain) {
  if (request === 'openai') {
    // Return a constructor function compatible with `new OpenAI({ apiKey, baseURL })`
    return function OpenAIMock(_options) {
      return {
        responses: {
          create: async function (_opts) {
            // Simulate a single assistant response that instructs running a harmless command
            const payload = {
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
                          timeout_sec: 5,
                        },
                      }),
                    },
                  ],
                },
              ],
            };
            return payload;
          },
        },
      };
    };
  }
  return originalLoad.apply(this, arguments);
};
