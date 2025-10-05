import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { runUnescapeString } from '../../src/commands/escapeString.js';

const tempDirs = [];

function createTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unescape-string-test-'));
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

describe('runUnescapeString', () => {
  test('unescapes JSON string input', () => {
    const result = runUnescapeString('"hello world"');
    expect(result.exit_code).toBe(0);
    expect(result.stdout).toBe('hello world');
    expect(result.stderr).toBe('');
  });

  test('writes decoded content to file when path provided', () => {
    const cwd = createTempDir();
    const relPath = 'output.txt';

    const result = runUnescapeString({ path: relPath, text: '"line 1\\nline 2"' }, cwd);

    expect(result.exit_code).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toBe('line 1\nline 2');

    const absPath = path.join(cwd, relPath);
    expect(fs.readFileSync(absPath, 'utf8')).toBe('line 1\nline 2');
  });

  test('returns error when JSON is invalid', () => {
    const result = runUnescapeString('"unterminated');

    expect(result.exit_code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Failed to parse JSON string');
  });

  test('returns error when path is empty string', () => {
    const result = runUnescapeString({ path: '  ', text: '"noop"' }, '.');

    expect(result.exit_code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('unescapeString path must be a non-empty string');
  });
});
