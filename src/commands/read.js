import { readFile } from 'node:fs/promises';
import path from 'node:path';

export function normalizePaths(readSpec) {
  const paths = [];
  if (!readSpec || typeof readSpec !== 'object') {
    return paths;
  }

  const seen = new Set();

  const addPath = (relPath) => {
    if (typeof relPath !== 'string') {
      return;
    }
    const trimmed = relPath.trim();
    if (!trimmed || seen.has(trimmed)) {
      return;
    }
    seen.add(trimmed);
    paths.push(trimmed);
  };

  if (typeof readSpec.path === 'string') {
    addPath(readSpec.path);
  }

  if (Array.isArray(readSpec.paths)) {
    for (const candidate of readSpec.paths) {
      addPath(candidate);
    }
  }

  return paths;
}

export async function runRead(readSpec, cwd = '.') {
  const start = Date.now();
  try {
    if (!readSpec || typeof readSpec !== 'object') {
      throw new Error('read spec must be an object');
    }

    const relPaths = normalizePaths(readSpec);
    if (relPaths.length === 0) {
      throw new Error('readSpec.path or readSpec.paths must include at least one path');
    }

    const encoding = readSpec.encoding || 'utf8';
    const segments = [];

    for (const relPath of relPaths) {
      const absPath = path.resolve(cwd || '.', relPath);
      let content = await readFile(absPath, { encoding });

      if (typeof readSpec.max_bytes === 'number' && readSpec.max_bytes >= 0) {
        const buffer = Buffer.from(content, encoding);
        content = buffer.slice(0, readSpec.max_bytes).toString(encoding);
      }

      if (typeof readSpec.max_lines === 'number' && readSpec.max_lines >= 0) {
        const lines = content.split('\n').slice(0, readSpec.max_lines);
        content = lines.join('\n');
      }

      segments.push(`${relPath}:::\n${content}`);
    }

    return {
      stdout: segments.join('\n'),
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

export default { runRead };
