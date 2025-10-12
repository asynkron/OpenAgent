/* eslint-env jest */
import { jest } from '@jest/globals';

const defaultEnv = { ...process.env };

async function loadModule() {
  jest.resetModules();
  process.env = { ...defaultEnv, FORCE_COLOR: '0' };
  jest.unstable_mockModule('dotenv/config', () => ({}));
  const imported = await import('../../index.ts');
  return imported.default;
}

afterEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  process.env = { ...defaultEnv };
});

describe('renderPlan', () => {
  test('renders flat plans sorted by readiness and priority', async () => {
    const mod = await loadModule();
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    try {
      mod.renderPlan([
        {
          id: 'build',
          title: 'Compile project',
          status: 'completed',
          age: 4,
          priority: 1,
        },
        {
          id: 'docs',
          title: 'Update docs',
          status: 'running',
          age: 2,
          priority: 2,
          command: {
            run: 'npm test --watch',
          },
        },
        {
          id: 'release',
          title: 'Release build',
          status: 'pending',
          age: 0,
          priority: 3,
          waitingForId: ['docs'],
        },
      ]);

      const outputs = logSpy.mock.calls.map((call) => call[0]);

      expect(outputs.length).toBe(1);

      const lines = outputs[0].split('\n');
      expect(lines).toEqual([
        '✔ 1. Compile project [completed] (priority 1, age 4)',
        '▶ 2. Update docs [running] (priority 2, age 2) — run: npm test --watch',
        '⏳ 3. Release build [pending] (priority 3, waiting for docs, age 0)',
      ]);
    } finally {
      logSpy.mockRestore();
    }
  });

  test('renderPlanProgress prints a textual progress bar', async () => {
    const mod = await loadModule();
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    try {
      mod.renderPlanProgress({ completedSteps: 2, totalSteps: 5, ratio: 0.4 });

      expect(logSpy).toHaveBeenCalledTimes(1);
      const output = logSpy.mock.calls[0][0];
      expect(output).toContain('Plan progress:');
      expect(output).toContain('40%');
      expect(output).toContain('2/5');
    } finally {
      logSpy.mockRestore();
    }
  });
});
