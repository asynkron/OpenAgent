"use strict";

const fs = require('fs');
const path = require('path');

async function runRead(readSpec, cwd = '.') {
  const start = Date.now();
  try {
    if (!readSpec || typeof readSpec !== 'object') {
      throw new Error('read spec must be an object');
    }

    const relPath = readSpec.path;
    if (typeof relPath !== 'string' || relPath.trim() === '') {
      throw new Error('readSpec.path must be a non-empty string');
    }

    const encoding = readSpec.encoding || 'utf8';
    const absPath = path.resolve(cwd || '.', relPath);
    let content = fs.readFileSync(absPath, { encoding });

    if (typeof readSpec.max_bytes === 'number' && readSpec.max_bytes >= 0) {
      const buffer = Buffer.from(content, encoding);
      content = buffer.slice(0, readSpec.max_bytes).toString(encoding);
    }

    if (typeof readSpec.max_lines === 'number' && readSpec.max_lines >= 0) {
      const lines = content.split('\n').slice(0, readSpec.max_lines);
      content = lines.join('\n');
    }

    return {
      stdout: content,
      stderr: '',
      exit_code: 0,
      killed: false,
      runtime_ms: Date.now() - start,
    };
  } catch (err) {
    return {
      stdout: '',
      stderr: err && err.message ? err.message : String(err),
      exit_code: 1,
      killed: false,
      runtime_ms: Date.now() - start,
    };
  }
}

module.exports = { runRead };
