import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { applyFileEdits } from '../../src/commands/edit.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_FILE = path.resolve(__dirname, 'tmp_edit_test.txt');

describe('applyFileEdits integration', () => {
  beforeEach(() => {
    if (fs.existsSync(TEST_FILE)) fs.unlinkSync(TEST_FILE);
    fs.writeFileSync(TEST_FILE, 'The quick brown fox', 'utf8');
  });

  afterEach(() => {
    if (fs.existsSync(TEST_FILE)) fs.unlinkSync(TEST_FILE);
  });

  test('applies edits and writes file', async () => {
    const edits = [
      { start: 4, end: 9, newText: 'slow' },
      { start: 16, end: 19, newText: 'dog' },
    ];
    const spec = { path: TEST_FILE, edits };
    const result = await applyFileEdits(spec, process.cwd());
    expect(result.exit_code).toBe(0);
    const content = fs.readFileSync(TEST_FILE, 'utf8');
    expect(content).toBe('The slow brown dog');
    expect(result.stdout).toMatch(/Edited/);
  });

  test('creates file when missing', async () => {
    const tmpDir = path.join(__dirname, 'tmp_missing');
    const targetPath = path.join(tmpDir, 'nonexistent_file.txt');

    fs.rmSync(tmpDir, { recursive: true, force: true });

    const spec = { path: targetPath, edits: [{ start: 0, end: 0, newText: 'x' }] };
    const result = await applyFileEdits(spec, process.cwd());

    expect(result.exit_code).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toMatch(/Created/);
    expect(fs.existsSync(targetPath)).toBe(true);
    expect(fs.readFileSync(targetPath, 'utf8')).toBe('x');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
