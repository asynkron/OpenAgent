import * as fs from 'node:fs';
import * as path from 'node:path';

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
    throw new Error('regex must be a non-empty string');
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

function buildResultOutput(results, dryRun) {
  const totalMatches = results.reduce((acc, item) => acc + item.matches, 0);
  const touchedFiles = results.filter((item) => item.matches > 0).length;

  const summaryLines = [`Total matches: ${totalMatches}`, `Files with changes: ${touchedFiles}`];

  results.forEach((item) => {
    summaryLines.push(`${item.path}: ${item.matches} matches${dryRun ? ' (dry-run)' : ''}`);
  });

  if (dryRun) {
    summaryLines.push('Dry-run: no files were modified.');
  }

  const detailSections = results.map((item) => {
    const status = dryRun
      ? item.matches > 0
        ? `Preview ${item.path}`
        : `Preview (no matches) ${item.path}`
      : item.changed
        ? `Updated ${item.path}`
        : `Unchanged ${item.path}`;

    const header = `--- ${item.path}`;
    return `${status}\n\n${header}\n${item.content}`;
  });

  return summaryLines.concat('', detailSections).join('\n');
}

const MAX_REPLACEMENTS = 100;

function applyRegexReplace(source, regex, replacement) {
  regex.lastIndex = 0;
  let matches = 0;
  const replaced = source.replace(regex, (...args) => {
    const match = args[0];
    if (match === undefined) {
      return args[0];
    }
    matches += 1;
    return replacement;
  });

  return { matches, replaced };
}

function applyRawReplace(source, raw, replacement) {
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new Error('raw must be a non-empty string');
  }

  const parts = source.split(raw);
  const matches = parts.length - 1;
  if (matches <= 0) {
    return { matches: 0, replaced: source };
  }

  return { matches, replaced: parts.join(replacement) };
}

export function runReplace(spec, cwd = '.') {
  const startTime = Date.now();
  try {
    if (!spec || typeof spec !== 'object') {
      throw new Error('replace spec must be an object');
    }

    const { raw, regex, pattern, replacement = '', flags, files, encoding = 'utf8' } = spec;
    const dryRun = spec.dry_run ?? spec.dryRun ?? false;

    validateFiles(files);

    const rawProvided = raw !== undefined && raw !== null;
    const regexPattern = regex ?? pattern;
    const regexProvided = regexPattern !== undefined && regexPattern !== null;

    if (rawProvided && regexProvided) {
      throw new Error('replace spec must provide either raw or regex, not both');
    }

    if (!rawProvided && !regexProvided) {
      throw new Error('replace spec must include either raw or regex');
    }

    if (spec.regex !== undefined && pattern !== undefined) {
      throw new Error('replace spec must not provide both regex and pattern');
    }

    const normalizedFlags = regexProvided ? normalizeFlags(flags) : undefined;
    const compiledRegex = regexProvided ? createRegex(regexPattern, normalizedFlags) : undefined;

    if (rawProvided && (typeof raw !== 'string' || raw.length === 0)) {
      throw new Error('raw must be a non-empty string');
    }

    const results = [];
    let totalMatches = 0;

    for (const relPath of files) {
      const absPath = path.resolve(cwd || '.', relPath);
      let original;
      try {
        original = fs.readFileSync(absPath, { encoding });
      } catch (err) {
        throw new Error(`Unable to read file: ${absPath} — ${err.message}`);
      }

      if (typeof original !== 'string') {
        throw new Error(`File is not textual: ${absPath}`);
      }

      const { matches, replaced } = rawProvided
        ? applyRawReplace(original, raw, replacement)
        : applyRegexReplace(original, compiledRegex, replacement);

      const relOutputPath = path.relative(process.cwd(), absPath);
      const wouldChange = matches > 0 && replaced !== original;

      totalMatches += matches;

      results.push({
        absPath,
        relPath: relOutputPath,
        matches,
        original,
        replaced,
        changed: !dryRun && wouldChange,
      });
    }

    if (totalMatches > MAX_REPLACEMENTS) {
      throw new Error(
        `Replace aborted: attempted ${totalMatches} replacements which exceeds the limit of ${MAX_REPLACEMENTS}.`,
      );
    }

    for (const item of results) {
      if (!dryRun && item.changed) {
        try {
          fs.writeFileSync(item.absPath, item.replaced, { encoding });
        } catch (err) {
          throw new Error(`Unable to write file: ${item.absPath} — ${err.message}`);
        }
      }
    }

    const finalizedResults = results.map((item) => ({
      path: item.relPath,
      matches: item.matches,
      content: dryRun ? item.replaced : item.changed ? item.replaced : item.original,
      changed: item.changed,
    }));

    return {
      stdout: buildResultOutput(finalizedResults, dryRun),
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
