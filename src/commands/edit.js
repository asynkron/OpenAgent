import * as fs from 'node:fs';
import * as path from 'node:path';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isPositionObject(value) {
  return (
    isPlainObject(value) &&
    Object.prototype.hasOwnProperty.call(value, 'line') &&
    Object.prototype.hasOwnProperty.call(value, 'column')
  );
}

function positionToIndex(text, position, label) {
  if (!isPositionObject(position)) {
    throw new Error(`${label} must be an object with "line" and "column" properties.`);
  }

  const { line, column } = position;

  if (!Number.isInteger(line) || line < 1) {
    throw new Error(`${label}.line must be a positive integer (1-based).`);
  }

  if (!Number.isInteger(column) || column < 0) {
    throw new Error(`${label}.column must be a non-negative integer.`);
  }

  const lines = text.split('\n');

  if (line > lines.length) {
    if (line === lines.length + 1 && column === 0) {
      return text.length;
    }

    throw new Error(`${label}.line ${line} exceeds the total number of lines ${lines.length}.`);
  }

  const lineText = lines[line - 1] ?? '';
  if (column > lineText.length) {
    throw new Error(`${label}.column ${column} exceeds the line length ${lineText.length}.`);
  }

  let index = column;
  for (let i = 0; i < line - 1; i += 1) {
    index += lines[i].length + 1;
  }

  return index;
}

function resolveIndex(text, value, label) {
  if (typeof value === 'undefined' || value === null) {
    throw new Error(`${label} is required.`);
  }

  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${label} must be a non-negative integer.`);
    }
    return value;
  }

  return positionToIndex(text, value, label);
}

export function validateRange(text, start, end) {
  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    throw new Error('start and end must be integers');
  }
  if (start < 0 || end < start || end > text.length) {
    throw new Error('Invalid range');
  }
}

function normalizeEdit(text, edit) {
  if (!isPlainObject(edit)) {
    throw new Error('edit must be an object');
  }

  const start = resolveIndex(text, edit.start, 'edit.start');
  const end = resolveIndex(text, edit.end, 'edit.end');
  const newText = typeof edit.newText === 'string' ? edit.newText : '';

  validateRange(text, start, end);

  return { start, end, newText };
}

function applyNormalizedEdit(text, normalizedEdit) {
  const { start, end, newText } = normalizedEdit;
  return text.slice(0, start) + newText + text.slice(end);
}

export function applyEdit(text, edit) {
  const normalized = normalizeEdit(text, edit);
  return applyNormalizedEdit(text, normalized);
}

export function applyEdits(text, edits) {
  if (!Array.isArray(edits)) {
    throw new Error('edits must be an array');
  }

  const normalized = edits.map((edit) => normalizeEdit(text, edit));
  normalized.sort((a, b) => b.start - a.start);

  return normalized.reduce(
    (acc, normalizedEdit) => applyNormalizedEdit(acc, normalizedEdit),
    text,
  );
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
