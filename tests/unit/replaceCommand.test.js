import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { runReplace } from '../../src/commands/replace.js';

function createTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('runReplace', () => {
  test('replaces matches across files with regex search', async () => {
    const dir = createTempDir('replace-basic-');
    const file = path.join(dir, 'sample.txt');
    fs.writeFileSync(file, 'foo and foo again', 'utf8');

    const result = await runReplace(
      {
        regex: 'foo',
        replacement: 'bar',
        files: ['sample.txt'],
      },
      dir,
    );

    const relOutput = path.relative(process.cwd(), file);

    expect(result.exit_code).toBe(0);
    expect(fs.readFileSync(file, 'utf8')).toBe('bar and bar again');
    expect(result.stdout).toContain('Total matches: 2');
    expect(result.stdout).toContain('Files with changes: 1');
    expect(result.stdout).toContain(`${relOutput}: 2 matches`);
    expect(result.stdout).toContain(`Updated ${relOutput}`);
    expect(result.stdout).toContain(`--- ${relOutput}`);
    expect(result.stdout).toContain('bar and bar again');
  });

  test('supports dry-run without modifying files', async () => {
    const dir = createTempDir('replace-dryrun-');
    const file = path.join(dir, 'dry.txt');
    fs.writeFileSync(file, 'hello world', 'utf8');

    const result = await runReplace(
      {
        regex: 'world',
        replacement: 'universe',
        files: ['dry.txt'],
        dry_run: true,
      },
      dir,
    );

    const relOutput = path.relative(process.cwd(), file);

    expect(result.exit_code).toBe(0);
    expect(result.stdout).toContain('Dry-run: no files were modified.');
    expect(result.stdout).toContain(`${relOutput}: 1 matches (dry-run)`);
    expect(result.stdout).toContain(`Preview ${relOutput}`);
    expect(result.stdout).toContain(`--- ${relOutput}`);
    expect(result.stdout).toContain('hello universe');
    expect(fs.readFileSync(file, 'utf8')).toBe('hello world');
  });

  test('supports raw string replacement without regex', async () => {
    const dir = createTempDir('replace-raw-');
    const file = path.join(dir, 'raw.txt');
    fs.writeFileSync(file, 'alpha beta alpha', 'utf8');

    const result = await runReplace(
      {
        raw: 'alpha',
        replacement: 'gamma',
        files: ['raw.txt'],
      },
      dir,
    );

    expect(result.exit_code).toBe(0);
    expect(fs.readFileSync(file, 'utf8')).toBe('gamma beta gamma');
    expect(result.stdout).toContain('Total matches: 2');
  });

  test('aborts when total replacements exceed the safety limit', async () => {
    const dir = createTempDir('replace-limit-');
    const file = path.join(dir, 'limit.txt');
    const content = Array.from({ length: 101 }, () => 'hit').join('\n');
    fs.writeFileSync(file, content, 'utf8');

    const result = await runReplace(
      {
        regex: 'hit',
        replacement: 'miss',
        files: ['limit.txt'],
      },
      dir,
    );

    expect(result.exit_code).toBe(1);
    expect(result.stderr).toMatch(/exceeds the limit of 100/);
    expect(fs.readFileSync(file, 'utf8')).toBe(content);
  });

  test('reports invalid regex patterns with exit_code 1', async () => {
    const result = await runReplace(
      {
        regex: '(',
        files: ['whatever.txt'],
      },
      '.',
    );

    expect(result.exit_code).toBe(1);
    expect(result.stderr).toMatch(/Invalid regex pattern/);
  });

  test('errors when both raw and regex are provided', async () => {
    const result = await runReplace(
      {
        raw: 'foo',
        regex: 'foo',
        files: ['whatever.txt'],
      },
      '.',
    );

    expect(result.exit_code).toBe(1);
    expect(result.stderr).toMatch(/either raw or regex/);
  });

  test('errors when neither raw nor regex are provided', async () => {
    const result = await runReplace(
      {
        files: ['whatever.txt'],
      },
      '.',
    );

    expect(result.exit_code).toBe(1);
    expect(result.stderr).toMatch(/must include either raw or regex/);
  });

  test('errors when raw is empty', async () => {
    const result = await runReplace(
      {
        raw: '',
        files: ['whatever.txt'],
      },
      '.',
    );

    expect(result.exit_code).toBe(1);
    expect(result.stderr).toMatch(/raw must be a non-empty string/);
  });
});
