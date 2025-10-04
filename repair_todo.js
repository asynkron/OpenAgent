const fs = require('fs');
const path = require('path');
const cmdEdit = require('./command_edit');

(async () => {
  const p = path.resolve('todo.md');
  const content = fs.readFileSync(p, 'utf8');
  // Detect exact duplication: file is two identical halves
  if (content.length % 2 !== 0) {
    console.error('Not an exact duplicate (odd length). Aborting.');
    process.exit(3);
  }
  const half = content.length / 2;
  const first = content.slice(0, half);
  const second = content.slice(half);
  if (first !== second) {
    console.error('todo.md does not contain an exact duplicated half. Aborting.');
    process.exit(2);
  }

  // Apply edit to delete the second half using the command_edit API
  const spec = { path: 'todo.md', edits: [{ start: half, end: content.length, newText: '' }] };
  const result = await cmdEdit.applyFileEdits(spec, process.cwd());
  console.log('applyFileEdits result:', JSON.stringify(result, null, 2));
  console.log('\n=== todo.md after repair ===\n');
  console.log(fs.readFileSync(p, 'utf8'));
  process.exit(result.exit_code === 0 ? 0 : 1);
})();
