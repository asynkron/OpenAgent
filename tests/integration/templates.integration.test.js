const fs = require('fs');
const path = require('path');
const child = require('child_process');

test('load templates file exists and is array', () => {
  const p = path.join(process.cwd(), 'templates', 'command-templates.json');
  const raw = fs.readFileSync(p, 'utf8');
  const arr = JSON.parse(raw);
  expect(Array.isArray(arr)).toBe(true);
  expect(arr.length).toBeGreaterThan(0);
});

test('render template via CLI', () => {
  const node = process.execPath;
  const vars = JSON.stringify({ package: 'lodash' });
  const out = child.execFileSync(node, ['index.js', 'templates', 'render', 'install-deps', vars], { encoding: 'utf8' }).trim();
  expect(out).toContain('npm install');
});
