const fs = require('fs');
const path = require('path');
const cmdEdit = require('./command_edit');

const p = path.resolve('todo.md');
let content = fs.readFileSync(p, 'utf8');

// Find the line that mentions Enhance text editing capabilities and replace it
const re = /^(\s*-\s*)Enhance text editing capabilities within the command workflow(.*)$/m;
const match = content.match(re);
if (!match) {
  console.error('Could not find the Enhance text editing line to replace. Aborting.');
  process.exit(2);
}

const lineStart = match.index;
const lineEnd = lineStart + match[0].length;
const leading = match[1];
// New checklist line; keep trailing comment if any removed
const newLine = `${leading}[x] Enhance text editing capabilities within the command workflow`;

const spec = { path: 'todo.md', edits: [{ start: lineStart, end: lineEnd, newText: newLine }] };

(async () => {
  const res = await cmdEdit.applyFileEdits(spec, process.cwd());
  console.log('applyFileEdits result:', JSON.stringify(res, null, 2));
  console.log('\n=== todo.md after marking task done ===\n');
  console.log(fs.readFileSync(p, 'utf8'));
  process.exit(res.exit_code === 0 ? 0 : 1);
})();
