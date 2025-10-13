/**
 * CLI option parsing for the replace-node transform. Normalises aliases so the
 * transform logic can rely on a single options object regardless of invocation style.
 */
import { resolve, isAbsolute } from 'node:path';
import type { ReplaceNodeOptions } from './types.js';

type ParsedArgs = Record<string, string | boolean>;

function parseProcessArgs(argv: readonly string[]): ParsedArgs {
  const out: ParsedArgs = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token || !token.startsWith('--')) {
      continue;
    }

    const eq = token.indexOf('=');
    if (eq !== -1) {
      const key = token.slice(2, eq);
      out[key] = token.slice(eq + 1);
      continue;
    }

    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('-')) {
      out[key] = next;
      i += 1;
    } else {
      out[key] = true;
    }
  }
  return out;
}

function coerceBoolean(value: unknown): boolean {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'false') {
      return false;
    }
    if (normalized === 'true') {
      return true;
    }
  }
  return Boolean(value);
}

function coerceMatchIndex(value: unknown): number | undefined {
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  return undefined;
}

function coerceReplacementPath(value: unknown): string | undefined {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (!candidate) {
    return undefined;
  }
  return isAbsolute(candidate) ? candidate : resolve(process.cwd(), candidate);
}

const ALLOWED_KINDS = new Set<ReplaceNodeOptions['kind']>([
  'class',
  'method',
  'function',
  'variable',
]);

export function normalizeOptions(overrides: Partial<ReplaceNodeOptions> = {}): ReplaceNodeOptions {
  const parsed = parseProcessArgs(process.argv.slice(2));
  const combined: ReplaceNodeOptions = { bodyOnly: false, ...parsed, ...overrides };

  const replacementPath =
    overrides.replacementPath ??
    coerceReplacementPath(
      parsed.replacement ??
        parsed.replacementFile ??
        parsed.r ??
        overrides.replacementPath ??
        overrides.replacement,
    );

  const matchIndex = coerceMatchIndex(overrides.matchIndex ?? parsed.index);
  const bodyOnly = coerceBoolean(overrides.bodyOnly ?? parsed['body-only'] ?? parsed.bodyOnly);
  const kind =
    typeof combined.kind === 'string' && ALLOWED_KINDS.has(combined.kind)
      ? combined.kind
      : undefined;

  return {
    ...combined,
    kind,
    replacementPath,
    matchIndex,
    bodyOnly,
  };
}
