import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export function normalizeFlags(flags) {
  if (flags === undefined || flags === null) {
    return 'g';
  }
  if (typeof flags !== 'string') {
    throw new Error('flags must be a string');
  }
  const seen = new Set();
  for (const char of flags) {
    if (char && !seen.has(char)) {
      seen.add(char);
    }
  }
  if (!seen.has('g')) {
    seen.add('g');
  }
  return Array.from(seen).join('');
}

export function createRegex(pattern, flags) {
  if (typeof pattern !== 'string' || pattern.trim() === '') {
    throw new Error('pattern must be a non-empty string');
  }

  try {
    return new RegExp(pattern, normalizeFlags(flags));
  } catch (err) {
    throw new Error(`Invalid regex pattern: ${err.message}`);
  }
}

function validateFiles(files) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('files must be a non-empty array of paths');
  }

  files.forEach((file, index) => {
    if (typeof file !== 'string' || file.trim() === '') {
      throw new Error(`files[${index}] must be a non-empty string`);
    }
  });
}

function buildResultSummary(results, dryRun) {
  const totalMatches = results.reduce((acc, item) => acc + item.matches, 0);
  const touchedFiles = results.filter((item) => item.matches > 0).length;

  const lines = [`Total matches: ${totalMatches}`, `Files with changes: ${touchedFiles}`];

  results.forEach((item) => {
    lines.push(`${item.path}: ${item.matches} matches${dryRun ? ' (dry-run)' : ''}`);
  });

  if (dryRun) {
    lines.push('Dry-run: no files were modified.');
  }

  return lines.join('\n');
}

export async function runReplace(spec, cwd = '.') {
  const startTime = Date.now();
  try {
    if (!spec || typeof spec !== 'object') {
      throw new Error('replace spec must be an object');
    }

    const { pattern, replacement = '', flags, files, encoding = 'utf8' } = spec;
    const dryRun = spec.dry_run ?? spec.dryRun ?? false;

    validateFiles(files);

    const normalizedFlags = normalizeFlags(flags);
    const regex = createRegex(pattern, normalizedFlags);

    const results = [];

    for (const relPath of files) {
      const absPath = path.resolve(cwd || '.', relPath);
      let original;
      try {
        original = await readFile(absPath, { encoding });
      } catch (err) {
        const reason = err && err.message ? err.message : String(err);
        throw new Error(`Unable to read file: ${absPath} — ${reason}`);
      }

      if (typeof original !== 'string') {
        throw new Error(`File is not textual: ${absPath}`);
      }

      let matches = 0;
      const replaced = original.replace(regex, (...args) => {
        const match = args[0];
        if (match === undefined) {
          return args[0];
        }
        matches += 1;
        return replacement;
      });

      if (!dryRun && matches > 0 && replaced !== original) {
        try {
          await writeFile(absPath, replaced, { encoding });
        } catch (err) {
          const reason = err && err.message ? err.message : String(err);
          throw new Error(`Unable to write file: ${absPath} — ${reason}`);
        }
      }

      results.push({
        path: path.relative(process.cwd(), absPath),
        matches,
      });
    }

    return {
      stdout: buildResultSummary(results, dryRun),
      stderr: '',
      exit_code: 0,
      killed: false,
      runtime_ms: Date.now() - startTime,
    };
  } catch (err) {
    return {
      stdout: '',
      stderr: err && err.message ? err.message : String(err),
      exit_code: 1,
      killed: false,
      runtime_ms: Date.now() - startTime,
    };
  }
}

export const _internal = {
  normalizeFlags,
  createRegex,
};

export default {
  runReplace,
  _internal,
};
