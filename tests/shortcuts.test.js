const fs = require('fs');
const path = require('path');
const child = require('child_process');

test('shortcuts file exists and has entries', () => {
  const p = path.join(process.cwd(), 'shortcuts', 'shortcuts.json');
  const raw = fs.readFileSync(p, 'utf8');
  const arr = JSON.parse(raw);
  expect(Array.isArray(arr)).toBe(true);
  expect(arr.length).toBeGreaterThan(0);
});

test('run shortcut CLI prints command', () => {
  const out = child.execSync('node index.js shortcuts run quick-tests', { encoding: 'utf8' }).trim();
  expect(out).toBe('npm test');
});
