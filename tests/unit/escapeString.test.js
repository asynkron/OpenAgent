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

  test('coerces primitive non-string inputs', () => {
    const numberResult = runEscapeString(123);
    expect(numberResult.exit_code).toBe(0);
    expect(numberResult.stdout).toBe('"123"');
    expect(numberResult.stderr).toBe('');

    const booleanResult = runEscapeString(false);
    expect(booleanResult.exit_code).toBe(0);
    expect(booleanResult.stdout).toBe('"false"');
    expect(booleanResult.stderr).toBe('');
  });

  test('supports object input with allowed keys', () => {
    const result = runEscapeString({ value: true });

    expect(result.exit_code).toBe(0);
    expect(result.stdout).toBe('"true"');
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

  test('uses provided encoding when reading file contents', () => {
    const cwd = createTempDir();
    const relPath = 'encoded.txt';
    const absPath = path.join(cwd, relPath);
    fs.writeFileSync(absPath, 'héllo', 'utf16le');

    const result = runEscapeString({ path: relPath, encoding: 'utf16le' }, cwd);

    expect(result.exit_code).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toBe(JSON.stringify('héllo'));
  });

  test('returns error when spec lacks supported string input key', () => {
    const result = runEscapeString({ other: 'value' });

    expect(result.exit_code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('escapeString spec must supply');

    const nullResult = runEscapeString(null);

    expect(nullResult.exit_code).toBe(1);
    expect(nullResult.stdout).toBe('');
    expect(nullResult.stderr).toContain('escapeString spec must supply');
  });

  test('returns error when path is empty', () => {
    const result = runEscapeString({ path: '  ' }, '.');

    expect(result.exit_code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('escapeString path must be a non-empty string');
  });
});
