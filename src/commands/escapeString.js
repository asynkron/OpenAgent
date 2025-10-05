const ESCAPE_INPUT_KEYS = ['text', 'value', 'input', 'string'];
const UNESCAPE_INPUT_KEYS = ['text', 'value', 'input', 'string', 'json'];

function coerceToString(value) {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return undefined;
}

function extractStringInput(spec, commandName, allowedKeys) {
  const simple = coerceToString(spec);
  if (simple !== undefined) {
    return simple;
  }

  if (spec && typeof spec === 'object') {
    for (const key of allowedKeys) {
      if (Object.prototype.hasOwnProperty.call(spec, key)) {
        const coerced = coerceToString(spec[key]);
        if (coerced !== undefined) {
          return coerced;
        }
      }
    }
  }

  const description = allowedKeys.length
    ? `one of the properties: ${allowedKeys.map((key) => `\`${key}\``).join(', ')}`
    : 'a string input value';

  throw new Error(`${commandName} spec must supply ${description}.`);
}

export function runEscapeString(spec, _cwd = '.') {
  void _cwd;
  const start = Date.now();
  try {
    const input = extractStringInput(spec, 'escapeString', ESCAPE_INPUT_KEYS);
    const escaped = JSON.stringify(input);
    return {
      stdout: escaped,
      stderr: '',
      exit_code: 0,
      killed: false,
      runtime_ms: Date.now() - start,
    };
  } catch (error) {
    return {
      stdout: '',
      stderr: error && error.message ? error.message : String(error),
      exit_code: 1,
      killed: false,
      runtime_ms: Date.now() - start,
    };
  }
}

export function runUnescapeString(spec, _cwd = '.') {
  void _cwd;
  const start = Date.now();
  try {
    const raw = extractStringInput(spec, 'unescapeString', UNESCAPE_INPUT_KEYS);
    const trimmed = raw.trim();
    if (!trimmed) {
      throw new Error('unescapeString requires a non-empty JSON string input.');
    }

    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch (err) {
      throw new Error(`Failed to parse JSON string: ${err && err.message ? err.message : String(err)}`);
    }

    if (typeof parsed !== 'string') {
      throw new Error('Parsed JSON value must be a string.');
    }

    return {
      stdout: parsed,
      stderr: '',
      exit_code: 0,
      killed: false,
      runtime_ms: Date.now() - start,
    };
  } catch (error) {
    return {
      stdout: '',
      stderr: error && error.message ? error.message : String(error),
      exit_code: 1,
      killed: false,
      runtime_ms: Date.now() - start,
    };
  }
}

export const _internal = {
  extractStringInput,
  coerceToString,
};

export default {
  runEscapeString,
  runUnescapeString,
  _internal,
};
