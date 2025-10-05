import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { applyFileEdits } from '../../src/commands/edit.js';

describe('applyFileEdits file creation', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apply-file-edits-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('creates missing file and parent directories', async () => {
    const relPath = 'nested/newfile.txt';
    const result = await applyFileEdits(
      {
        path: relPath,
        edits: [
          { start: 0, end: 0, newText: 'Hello world' },
        ],
      },
      tmpDir,
    );

    const absPath = path.join(tmpDir, relPath);

    expect(fs.existsSync(absPath)).toBe(true);
    expect(fs.readFileSync(absPath, 'utf8')).toBe('Hello world');
    expect(result.exit_code).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Created');
  });

  test('edits existing file and reports Edited', async () => {
    const relPath = 'existing.txt';
    const absPath = path.join(tmpDir, relPath);
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, 'original', 'utf8');

    const result = await applyFileEdits(
      {
        path: relPath,
        edits: [
          { start: 0, end: 8, newText: 'updated' },
        ],
      },
      tmpDir,
    );

    expect(fs.readFileSync(absPath, 'utf8')).toBe('updated');
    expect(result.exit_code).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Edited');
  });
});
