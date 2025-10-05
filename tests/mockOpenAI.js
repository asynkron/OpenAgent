// Preload mock for 'openai' module so the agent uses our stubbed client
import * as nodeModule from 'node:module';

const originalLoad = nodeModule._load;
nodeModule._load = function (request, parent, isMain) {
  if (request === 'openai') {
    return function OpenAIMock(_options) {
      return {
        responses: {
          create: async function () {
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
  return originalLoad.apply(this, [request, parent, isMain]);
};
