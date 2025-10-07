import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { jest } from '@jest/globals';

import { runApplyPatch } from '../../src/commands/run.js';

describe('runApplyPatch', () => {
  const tempDirs = [];

  function createTempDir() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apply-patch-'));
    tempDirs.push(tmpDir);
    return tmpDir;
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    for (const dir of tempDirs) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch (error) {
        // Best-effort cleanup.
      }
    }
  });

  test('applies a unified diff patch to an existing file', async () => {
    const dir = createTempDir();
    const filePath = path.join(dir, 'sample.txt');
    fs.writeFileSync(filePath, 'original\n', 'utf8');

    const patch = [
      'diff --git a/sample.txt b/sample.txt',
      'index e69de29..3b18e13 100644',
      '--- a/sample.txt',
      '+++ b/sample.txt',
      '@@ -1 +1,2 @@',
      ' original',
      '+patched',
      '',
    ].join('\n');

    const result = await runApplyPatch({ target: 'sample.txt', patch }, dir);

    expect(result.exit_code).toBe(0);
    expect(result.stderr).toBe('');
    expect(fs.readFileSync(filePath, 'utf8')).toBe('original\npatched\n');
    expect(result.stdout).toMatch(/Applied patch to/);
  });

  test('creates a new file when patch declares /dev/null as the source', async () => {
    const dir = createTempDir();
    const patch = [
      'diff --git a/new.txt b/new.txt',
      'new file mode 100644',
      'index 0000000..3b18e13',
      '--- /dev/null',
      '+++ b/new.txt',
      '@@ -0,0 +1 @@',
      '+hello',
      '',
    ].join('\n');

    const result = await runApplyPatch({ target: 'new.txt', patch }, dir);

    expect(result.exit_code).toBe(0);
    expect(fs.readFileSync(path.join(dir, 'new.txt'), 'utf8')).toBe('hello\n');
  });

  test('removes a file when patch deletes all content', async () => {
    const dir = createTempDir();
    const filePath = path.join(dir, 'sample.txt');
    fs.writeFileSync(filePath, 'original\n', 'utf8');

    const patch = [
      'diff --git a/sample.txt b/sample.txt',
      'deleted file mode 100644',
      'index e69de29..0000000',
      '--- a/sample.txt',
      '+++ /dev/null',
      '@@ -1 +0,0 @@',
      '-original',
      '',
    ].join('\n');

    const result = await runApplyPatch({ target: 'sample.txt', patch }, dir);

    expect(result.exit_code).toBe(0);
    expect(fs.existsSync(filePath)).toBe(false);
    expect(result.stdout).toMatch(/Applied patch to/);
  });

  test('returns failure when patch text is invalid', async () => {
    const dir = createTempDir();
    const result = await runApplyPatch({ target: 'missing.txt', patch: '' }, dir);
    expect(result.exit_code).toBe(1);
    expect(result.stderr).toMatch(/non-empty string/);
  });

  test('fails when patch attempts to rename a file', async () => {
    const dir = createTempDir();
    const filePath = path.join(dir, 'old.txt');
    fs.writeFileSync(filePath, 'content\n', 'utf8');

    // The patch only renames the file, which should surface an unsupported operation error.
    const patch = [
      'diff --git a/old.txt b/new.txt',
      'similarity index 100%',
      'rename from old.txt',
      'rename to new.txt',
      '--- a/old.txt',
      '+++ b/new.txt',
      '',
    ].join('\n');

    const result = await runApplyPatch({ target: 'old.txt', patch }, dir);

    expect(result.exit_code).toBe(1);
    expect(result.stderr).toMatch(/rename/);
  });
});
