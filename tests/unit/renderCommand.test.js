import { jest } from '@jest/globals';

const defaultEnv = { ...process.env };

async function loadRenderer() {
  jest.resetModules();
  process.env = { ...defaultEnv, FORCE_COLOR: '0' };
  jest.unstable_mockModule('dotenv/config', () => ({}));
  const imported = await import('../../index.js');
  return imported.renderCommand;
}

afterEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  process.env = { ...defaultEnv };
});

describe('renderCommand (READ)', () => {
  test('falls back to raw stdout when filtered payload is empty', async () => {
    const renderCommand = await loadRenderer();
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    try {
      const command = { run: 'read src/file.txt' };
      const result = {
        stdout: 'src/file.txt:::\nline 1\nline 2',
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
        execution: { type: 'READ', spec: { path: 'src/file.txt' } },
      };

      renderCommand(command, result, preview);

      const outputs = logSpy.mock.calls.map((call) => call[0]);
      expect(outputs).toHaveLength(2);
      expect(outputs[1]).toContain('Read 2 lines from 1 file.');
      expect(outputs[1]).toContain('src/file.txt: 2 lines');
    } finally {
      logSpy.mockRestore();
    }
  });

  test('reports zero lines when filters remove all output', async () => {
    const renderCommand = await loadRenderer();
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    try {
      const command = { run: 'read src/file.txt', filter_regex: 'nomatch' };
      const result = {
        stdout: 'src/file.txt:::\nline 1\nline 2',
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
        execution: { type: 'READ', spec: { path: 'src/file.txt' } },
      };

      renderCommand(command, result, preview);

      const outputs = logSpy.mock.calls.map((call) => call[0]);
      expect(outputs).toHaveLength(2);
      expect(outputs[1]).toContain('No lines matched the applied filters across 1 file.');
      expect(outputs[1]).toContain('src/file.txt: 0 lines');
    } finally {
      logSpy.mockRestore();
    }
  });
});
