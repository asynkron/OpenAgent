import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { runReplace } from '../../src/commands/replace.js';

function createTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('runReplace', () => {
  test('replaces matches across files', async () => {
    const dir = createTempDir('replace-basic-');
    const file = path.join(dir, 'sample.txt');
    fs.writeFileSync(file, 'foo and foo again', 'utf8');

    const result = await runReplace(
      {
        pattern: 'foo',
        replacement: 'bar',
        files: ['sample.txt'],
      },
      dir,
    );

    expect(result.exit_code).toBe(0);
    expect(fs.readFileSync(file, 'utf8')).toBe('bar and bar again');
  });

  test('supports dry-run without modifying files', async () => {
    const dir = createTempDir('replace-dryrun-');
    const file = path.join(dir, 'dry.txt');
    fs.writeFileSync(file, 'hello world', 'utf8');

    const result = await runReplace(
      {
        pattern: 'world',
        replacement: 'universe',
        files: ['dry.txt'],
        dry_run: true,
      },
      dir,
    );

    expect(result.exit_code).toBe(0);
    expect(result.stdout).toMatch(/Dry-run/);
    expect(fs.readFileSync(file, 'utf8')).toBe('hello world');
  });

  test('reports invalid patterns with exit_code 1', async () => {
    const result = await runReplace(
      {
        pattern: '(',
        files: ['whatever.txt'],
      },
      '.',
    );

    expect(result.exit_code).toBe(1);
    expect(result.stderr).toMatch(/Invalid regex pattern/);
  });
});
