import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const SCRIPTS_DIR = path.join(PROJECT_ROOT, 'packages/core/scripts');

function createWorkspace() {
  const dir = mkdtempSync(path.join(tmpdir(), 'openagent-scripts-test-'));
  const cleanup = () => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch (_error) {
      // Ignore cleanup errors.
    }
  };
  return { dir, cleanup };
}

function runScript(args, options = {}) {
  const result = spawnSync('node', args, {
    encoding: 'utf8',
    env: { ...process.env },
    ...options,
  });
  if (result.error) {
    throw result.error;
  }
  return result;
}

describe('packages/core/scripts/apply_patch.mjs', () => {
  test('applies a patch to the target file', () => {
    const { dir, cleanup } = createWorkspace();
    try {
      const targetPath = path.join(dir, 'target.txt');
      writeFileSync(targetPath, 'hello\n', 'utf8');

      const patch = [
        '*** Begin Patch',
        '*** Update File: target.txt',
        '@@',
        '-hello',
        '+hello world',
        '*** End Patch',
        '',
      ].join('\n');

      const result = runScript([path.join(SCRIPTS_DIR, 'apply_patch.mjs')], {
        cwd: dir,
        input: patch,
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Success. Updated the following files:');
      expect(readFileSync(targetPath, 'utf8')).toBe('hello world\n');
    } finally {
      cleanup();
    }
  });

  test('adds a brand new file when requested', () => {
    const { dir, cleanup } = createWorkspace();
    try {
      const patch = [
        '*** Begin Patch',
        '*** Add File: notes/new-file.txt',
        '+first line',
        '+second line',
        '*** End Patch',
        '',
      ].join('\n');

      const result = runScript([path.join(SCRIPTS_DIR, 'apply_patch.mjs')], {
        cwd: dir,
        input: patch,
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Success. Updated the following files:');
      const createdPath = path.join(dir, 'notes/new-file.txt');
      expect(readFileSync(createdPath, 'utf8')).toBe('first line\nsecond line');
    } finally {
      cleanup();
    }
  });
});

describe('packages/core/scripts/rename-identifier.mjs', () => {
  test('renames an identifier and updates references when applying changes', () => {
    const { dir, cleanup } = createWorkspace();
    try {
      const filePath = path.join(dir, 'sample.js');
      writeFileSync(
        filePath,
        ['export function greet() {', "  const message = 'hi';", '  return message;', '}', ''].join(
          '\n',
        ),
        'utf8',
      );

      const result = runScript(
        [
          path.join(SCRIPTS_DIR, 'rename-identifier.mjs'),
          '--file',
          filePath,
          '--old',
          'message',
          '--new',
          'text',
          '--apply',
          '--check',
        ],
        { cwd: dir },
      );

      expect(result.status).toBe(0);
      expect(result.stderr).toContain('Successfully applied rename');
      const updated = readFileSync(filePath, 'utf8');
      expect(updated).toContain("const text = 'hi';");
      expect(updated).toContain('return text;');
    } finally {
      cleanup();
    }
  });
});

describe('packages/core/scripts/edit-lines.mjs', () => {
  test('replaces the requested lines and preserves surrounding content', () => {
    const { dir, cleanup } = createWorkspace();
    try {
      const filePath = path.join(dir, 'lines.txt');
      writeFileSync(filePath, ['alpha', 'beta', 'gamma', ''].join('\n'), 'utf8');

      const result = runScript(
        [
          path.join(SCRIPTS_DIR, 'edit-lines.mjs'),
          '--file',
          filePath,
          '--start',
          '2',
          '--count',
          '1',
          '--text',
          'bravo',
          '--apply',
        ],
        { cwd: dir },
      );

      expect(result.status).toBe(0);
      expect(result.stderr).toContain('Successfully applied edit');
      expect(readFileSync(filePath, 'utf8')).toBe(['alpha', 'bravo', 'gamma', ''].join('\n'));
    } finally {
      cleanup();
    }
  });
});
