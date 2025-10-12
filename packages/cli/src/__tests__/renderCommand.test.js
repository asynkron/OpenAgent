/* eslint-env jest */
import { jest } from '@jest/globals';

const defaultEnv = { ...process.env };

async function loadRenderer() {
  jest.resetModules();
  process.env = { ...defaultEnv, FORCE_COLOR: '0' };
  jest.unstable_mockModule('dotenv/config', () => ({}));
  const imported = await import('../../index.ts');
  return imported.renderCommand;
}

afterEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  process.env = { ...defaultEnv };
});

describe('renderCommand (execute summary)', () => {
  test('falls back to generic success message when preview has no stdout', async () => {
    const renderCommand = await loadRenderer();
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    try {
      const command = { run: 'cat src/file.txt' };
      const result = {
        stdout: 'file contents',
        stderr: '',
        exit_code: 0,
        killed: false,
        runtime_ms: 1,
      };
      const preview = {
        stdout: '',
        stderr: '',
        stdoutPreview: '',
        stderrPreview: '',
        execution: { type: 'EXECUTE' },
      };

      renderCommand(command, result, preview);

      const outputs = logSpy.mock.calls.map((call) => call[0]);
      expect(outputs).toHaveLength(2);
      expect(outputs[1]).toContain('EXECUTE (cat src/file.txt)');
      expect(outputs[1]).toContain('Command completed successfully.');
      expect(outputs[1]).toContain('Exit code: 0');
    } finally {
      logSpy.mockRestore();
    }
  });

  test('summarizes stdout preview when available', async () => {
    const renderCommand = await loadRenderer();
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    try {
      const command = { run: 'cat src/file.txt' };
      const result = {
        stdout: 'line 1\nline 2\nline 3',
        stderr: '',
        exit_code: 0,
        killed: false,
        runtime_ms: 1,
      };
      const preview = {
        stdout: '',
        stderr: '',
        stdoutPreview: 'line 1\nline 2\nline 3',
        stderrPreview: '',
        execution: { type: 'EXECUTE' },
      };

      renderCommand(command, result, preview);

      const outputs = logSpy.mock.calls.map((call) => call[0]);
      expect(outputs).toHaveLength(2);
      expect(outputs[1]).toContain('line 1');
      expect(outputs[1]).toContain('+ 1 more line');
      expect(outputs[1]).toContain('line 3');
    } finally {
      logSpy.mockRestore();
    }
  });
});
