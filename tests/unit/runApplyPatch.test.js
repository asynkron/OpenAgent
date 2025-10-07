import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { jest } from '@jest/globals';

import { runApplyPatch } from '../../src/commands/run.js';

describe('runApplyPatch', () => {
  const tempDirs = [];

  function createTempRepo() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apply-patch-'));
    tempDirs.push(tmpDir);
    execSync('git init', { cwd: tmpDir, stdio: 'ignore' });
    execSync('git config user.name "Test User"', { cwd: tmpDir });
    execSync('git config user.email "test@example.com"', { cwd: tmpDir });
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

  test('applies a git diff patch to the target file', async () => {
    const repoDir = createTempRepo();
    const filePath = path.join(repoDir, 'sample.txt');

    fs.writeFileSync(filePath, 'original\n', 'utf8');
    execSync('git add sample.txt', { cwd: repoDir, stdio: 'ignore' });
    execSync('git commit -m "init"', {
      cwd: repoDir,
      stdio: 'ignore',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'Test User',
        GIT_AUTHOR_EMAIL: 'test@example.com',
        GIT_COMMITTER_NAME: 'Test User',
        GIT_COMMITTER_EMAIL: 'test@example.com',
      },
    });

    fs.writeFileSync(filePath, 'original\npatched\n', 'utf8');
    const patch = execSync('git diff', { cwd: repoDir }).toString('utf8');

    execSync('git checkout -- sample.txt', { cwd: repoDir, stdio: 'ignore' });

    const result = await runApplyPatch({ target: 'sample.txt', patch }, repoDir, 30);

    expect(result.exit_code).toBe(0);
    expect(fs.readFileSync(filePath, 'utf8')).toBe('original\npatched\n');
    expect(result.stdout).toMatch(/Applied patch to/);
  });

  test('returns failure when patch text is invalid', async () => {
    const repoDir = createTempRepo();
    const result = await runApplyPatch({ target: 'missing.txt', patch: '' }, repoDir, 10);
    expect(result.exit_code).toBe(1);
    expect(result.stderr).toMatch(/non-empty string/);
  });
});
