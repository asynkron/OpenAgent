/**
 * Utilities for parsing and merging `read` command specifications.
 *
 * Extracted from the agent loop to enable focused testing and reuse.
 */

function parseReadSpecTokens(tokens) {
  const spec = {};
  const positional = [];

  if (!Array.isArray(tokens)) {
    return spec;
  }

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!token) {
      continue;
    }

    if (token.startsWith('--')) {
      const eqIndex = token.indexOf('=');
      const rawKey = eqIndex !== -1 ? token.slice(2, eqIndex) : token.slice(2);
      let value;
      if (eqIndex !== -1) {
        value = token.slice(eqIndex + 1);
      } else if (i + 1 < tokens.length && !tokens[i + 1].startsWith('--')) {
        value = tokens[i + 1];
        i += 1;
      }

      const key = rawKey.toLowerCase().replace(/-/g, '_');

      if (key === 'encoding' && value) {
        spec.encoding = value;
      } else if (key === 'max_lines' && value) {
        const parsed = parseInt(value, 10);
        if (Number.isFinite(parsed)) {
          spec.max_lines = parsed;
        }
      } else if (key === 'max_bytes' && value) {
        const parsed = parseInt(value, 10);
        if (Number.isFinite(parsed)) {
          spec.max_bytes = parsed;
        }
      }

      continue;
    }

    positional.push(token);
  }

  if (positional.length > 0) {
    spec.path = positional[0];
    if (positional.length > 1) {
      spec.paths = positional.slice(1);
    }
  }

  return spec;
}

function mergeReadSpecs(base, override) {
  const merged = { ...base };

  const orderedPaths = [];
  const addPath = (candidate) => {
    if (typeof candidate !== 'string') {
      return;
    }
    const trimmed = candidate.trim();
    if (!trimmed || orderedPaths.includes(trimmed)) {
      return;
    }
    orderedPaths.push(trimmed);
  };

  const addPathsFromSpec = (spec) => {
    if (!spec || typeof spec !== 'object') {
      return;
    }
    if (typeof spec.path === 'string') {
      addPath(spec.path);
    }
    if (Array.isArray(spec.paths)) {
      for (const candidate of spec.paths) {
        addPath(candidate);
      }
    }
  };

  addPathsFromSpec(base);
  addPathsFromSpec(override);

  if (orderedPaths.length > 0) {
    merged.path = orderedPaths[0];
    if (orderedPaths.length > 1) {
      merged.paths = orderedPaths.slice(1);
    } else {
      delete merged.paths;
    }
  } else {
    delete merged.path;
    delete merged.paths;
  }

  if (override && typeof override === 'object') {
    if (override.encoding) {
      merged.encoding = override.encoding;
    }

    if (typeof override.max_lines === 'number') {
      merged.max_lines = override.max_lines;
    }

    if (typeof override.max_bytes === 'number') {
      merged.max_bytes = override.max_bytes;
    }
  }

  return merged;
}

export { parseReadSpecTokens, mergeReadSpecs };

export default {
  parseReadSpecTokens,
  mergeReadSpecs,
};
