import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { runEscapeString } from '../../src/commands/escapeString.js';

const tempDirs = [];

function createTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'escape-string-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (error) {
      void error;
    }
  }
});

describe('runEscapeString', () => {
  test('escapes direct string input', () => {
    const result = runEscapeString('hello world');
    expect(result.exit_code).toBe(0);
    expect(result.stdout).toBe('"hello world"');
    expect(result.stderr).toBe('');
  });

  test('reads file content when path is provided', () => {
    const cwd = createTempDir();
    const relPath = 'sample.txt';
    const absPath = path.join(cwd, relPath);
    fs.writeFileSync(absPath, 'line 1\nline 2', 'utf8');

    const result = runEscapeString({ path: relPath }, cwd);

    expect(result.exit_code).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toBe('"line 1\\nline 2"');
  });

  test('returns error when path is empty', () => {
    const result = runEscapeString({ path: '  ' }, '.');

    expect(result.exit_code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('escapeString path must be a non-empty string');
  });
});
