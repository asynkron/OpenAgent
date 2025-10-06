import * as fs from 'node:fs';
import * as path from 'node:path';

export function validateRange(text, start, end) {
  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    throw new Error('start and end must be integers');
  }
  if (start < 0 || end < start || end > text.length) {
    throw new Error('Invalid range');
  }
}

export function applyEdit(text, edit) {
  if (!edit || typeof edit !== 'object') {
    throw new Error('edit must be an object');
  }
  const { start, end, newText = '' } = edit;
  validateRange(text, start, end);
  return text.slice(0, start) + newText + text.slice(end);
}

export function applyEdits(text, edits) {
  if (!Array.isArray(edits)) {
    throw new Error('edits must be an array');
  }
  const sorted = edits.slice().sort((a, b) => b.start - a.start);
  return sorted.reduce((acc, edit) => applyEdit(acc, edit), text);
}

export async function applyFileEdits(editSpec, cwd = '.') {
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

    let original = '';
    let fileExisted = true;

    try {
      original = fs.readFileSync(absPath, { encoding });
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        fileExisted = false;
        const dir = path.dirname(absPath);
        if (dir && dir !== absPath) {
          fs.mkdirSync(dir, { recursive: true });
        }
        original = '';
      } else {
        throw new Error(`Unable to read file: ${absPath} — ${err.message}`);
      }
    }

    const updated = applyEdits(original, edits);
    fs.writeFileSync(absPath, updated, { encoding });

    const relOutputPath = path.relative(process.cwd(), absPath);
    const header = fileExisted ? `Edited ${relOutputPath}` : `Created ${relOutputPath}`;
    const fileHeading = `--- ${relOutputPath}`;

    return {
      stdout: `${header}\n\n${fileHeading}\n${updated}`,
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

export async function runEdit(editSpec, cwd = '.') {
  return applyFileEdits(editSpec, cwd);
}

export default {
  applyEdit,
  applyEdits,
  applyFileEdits,
  runEdit,
};
