const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

(async function main(){
  // create isolated XDG_DATA_HOME outside repo
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'cmdstats-test-'));
  process.env.XDG_DATA_HOME = tmpBase;
  const statsPath = path.join(process.env.XDG_DATA_HOME, 'command-tracker', 'command-stats.json');

  // require index.js after setting XDG_DATA_HOME
  const index = require(path.join(process.cwd(), 'index.js'));
  if (typeof index.runCommandAndTrack !== 'function') {
    console.error('runCommandAndTrack not found on index exports');
    process.exit(2);
  }

  // Run two commands via the wrapper. Use a simple, cross-platform command 'node -v' or 'echo'.
  // Use 'node -v' to avoid shell quoting issues; wrapper derives key from first token 'node'.
  await index.runCommandAndTrack('node -v', process.cwd(), 30);
  await index.runCommandAndTrack('node -v', process.cwd(), 30);

  // Read stats file
  let data = {};
  try {
    data = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
  } catch (e) {
    console.error('Failed to read stats file at', statsPath, e && e.message);
    process.exit(3);
  }

  // Expect key 'node' with count 2
  const nodeCount = data['node'];
  try {
    assert.strictEqual(nodeCount, 2, `expected node count 2, got ${nodeCount}`);
    console.log('OK');
    // cleanup
    fs.rmSync(tmpBase, { recursive: true, force: true });
    process.exit(0);
  } catch (err) {
    console.error('Assertion failed:', err && err.message);
    // print the file for debugging
    console.error('Stats content:', JSON.stringify(data, null, 2));
    fs.rmSync(tmpBase, { recursive: true, force: true });
    process.exit(4);
  }
})();
