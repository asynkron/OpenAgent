import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

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
        pattern: 'world',
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
