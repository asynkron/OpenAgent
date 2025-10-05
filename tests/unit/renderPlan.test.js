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

      expect(outputs.length).toBe(3);
      expect(outputs[0]).toBe('');
      expect(outputs[1]).toContain('Plan __');

      const lines = outputs[2].split('\n');

      expect(lines).toContain('✔ Step 1 - Root task');
      expect(lines).toContain('  ▶ Step 1.1 - Nested work');
      expect(lines).toContain('    • Step 1.1.1 - Leaf step');
      expect(lines).toContain('  ✖ Step 1.a - Blocked child');
      expect(lines).toContain('• Step 2 - Follow-up');
    } finally {
      logSpy.mockRestore();
    }
  });
});
