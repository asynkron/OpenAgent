const fs = require('fs');
const path = require('path');
const { applyFileEdits } = require('../../src/commands/edit');

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
      { start: 16, end: 19, newText: 'dog' }
    ];
    const spec = { path: TEST_FILE, edits };
    const result = await applyFileEdits(spec, process.cwd());
    expect(result.exit_code).toBe(0);
    const content = fs.readFileSync(TEST_FILE, 'utf8');
    expect(content).toBe('The slow brown dog');
    expect(result.stdout).toMatch(/Edited/);
  });

  test('returns error result when file is missing', async () => {
    const spec = { path: 'nonexistent_file.txt', edits: [{ start: 0, end: 0, newText: 'x' }] };
    const result = await applyFileEdits(spec, process.cwd());
    expect(result.exit_code).toBe(1);
    expect(result.stderr).toMatch(/Unable to read file/);
  });
});
