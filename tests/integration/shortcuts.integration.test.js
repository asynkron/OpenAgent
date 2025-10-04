const child = require('child_process');
const path = require('path');

test('shortcuts file exists and has entries', () => {
  const p = path.join(process.cwd(), 'shortcuts', 'shortcuts.json');
  const raw = require('fs').readFileSync(p, 'utf8');
  const arr = JSON.parse(raw);
  expect(Array.isArray(arr)).toBe(true);
  expect(arr.length).toBeGreaterThan(0);
});

test('run shortcut CLI prints command (tolerant of other CLI output)', () => {
  const node = process.execPath;
  const out = child.execFileSync(node, ['index.js', 'shortcuts', 'run', 'quick-tests'], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }).trim();
  expect(out).toMatch(/npm test/);
});
