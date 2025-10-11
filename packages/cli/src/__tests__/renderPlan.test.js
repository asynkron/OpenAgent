/* eslint-env jest */
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
  test('renders flat plans sorted by readiness and priority', async () => {
    const mod = await loadModule();
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    try {
      mod.renderPlan([
        {
          id: 'task-ready',
          title: 'Run tests',
          status: 'running',
          age: 1,
          priority: 1,
          waitingForId: [],
          command: { run: 'npm test' },
        },
        {
          id: 'task-ship',
          title: 'Ship release',
          status: 'pending',
          age: 0,
          priority: 2,
          waitingForId: ['task-ready'],
          command: { run: 'echo deploy' },
        },
        {
          id: 'task-blocked',
          title: 'Blocked work',
          status: 'pending',
          age: 0,
          priority: 3,
          waitingForId: ['missing-task'],
        },
      ]);

      const outputs = logSpy.mock.calls.map((call) => call[0]);

      expect(outputs.length).toBe(1);

      const lines = outputs[0].split('\n');
      expect(lines).toEqual([
        '▶ Run tests ([running], priority 1, age 1, id task-ready, ready to run) — run: npm test',
        '⏳ Ship release ([pending], priority 2, age 0, id task-ship, waiting on task-ready) — run: echo deploy',
        '! Blocked work ([pending], priority 3, age 0, id task-blocked, waiting on missing-task (missing))',
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
