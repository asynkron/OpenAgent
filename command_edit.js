const fs = require('fs');
const path = require('path');
const { applyEdits } = require('./editText');

/**
 * Apply edits to a file on disk.
 * editSpec: { path: string, edits: [{start, end, newText}], encoding?: string }
 * cwd: working directory to resolve relative paths
 * Returns an object similar to runCommand result
 */
async function applyFileEdits(editSpec, cwd = '.') {
  const start = Date.now();
  try {
    if (!editSpec || typeof editSpec !== 'object') {
      throw new Error('editSpec must be an object');
    }
    const relPath = editSpec.path;
    if (typeof relPath !== 'string' || relPath.trim() === '') {
      throw new Error('editSpec.path must be a non-empty string');
    }
    const edits = editSpec.edits;
    if (!Array.isArray(edits)) {
      throw new Error('editSpec.edits must be an array');
    }
    const encoding = editSpec.encoding || 'utf8';

    const absPath = path.resolve(cwd || '.', relPath);
    let original;
    try {
      original = fs.readFileSync(absPath, { encoding });
    } catch (err) {
      throw new Error('Unable to read file: ' + absPath + ' — ' + err.message);
    }

    const updated = applyEdits(original, edits);

    fs.writeFileSync(absPath, updated, { encoding });

    const runtime_ms = Date.now() - start;
    return {
      stdout: `Edited ${path.relative(process.cwd(), absPath)}\n` + updated,
      stderr: '',
      exit_code: 0,
      killed: false,
      runtime_ms,
    };
  } catch (err) {
    const runtime_ms = Date.now() - start;
    return {
      stdout: '',
      stderr: String(err.message || err),
      exit_code: 1,
      killed: false,
      runtime_ms,
    };
  }
}

module.exports = { applyFileEdits };
