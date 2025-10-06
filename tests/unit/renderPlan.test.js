import { jest } from '@jest/globals';

const defaultEnv = { ...process.env };

async function loadModule() {
  jest.resetModules();
  process.env = { ...defaultEnv, FORCE_COLOR: '0' };
  jest.unstable_mockModule('dotenv/config', () => ({}));
  const imported = await import('../../index.js');
  return imported.default;
}

afterEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  process.env = { ...defaultEnv };
});

describe('renderPlan', () => {
  test('renders hierarchical plans with nested steps', async () => {
    const mod = await loadModule();
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    try {
      mod.renderPlan([
        {
          step: '1',
          title: 'Root task',
          status: 'completed',
          substeps: [
            {
              step: '1.1',
              title: 'Nested work',
              status: 'running',
              substeps: [
                {
                  title: 'Leaf step',
                  status: 'pending',
                },
              ],
            },
            {
              step: 'a',
              title: 'Blocked child',
              status: 'blocked',
            },
          ],
        },
        {
          title: 'Follow-up',
          status: 'pending',
        },
      ]);

      const outputs = logSpy.mock.calls.map((call) => call[0]);

      expect(outputs.length).toBe(1);

      const lines = outputs[0].split('\n');
      expect(lines).toEqual([
        '✔ 1. Root task',
        '  ▶ 1.1. Nested work',
        '    • 1.1.1. Leaf step',
        '  ✖ 1.a. Blocked child',
        '• 2. Follow-up',
      ]);
    } finally {
      logSpy.mockRestore();
    }
  });
});
