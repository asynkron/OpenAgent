/** File system helpers with a simple in-memory cache for replacement content. */
import { readFileSync } from 'node:fs';
import type { ReplaceNodeOptions } from './types.js';

const replacementCache = new Map<string, string>();

export function readReplacementFile(options: ReplaceNodeOptions): string | null {
  const { replacementPath } = options;
  if (!replacementPath) {
    return null;
  }

  if (replacementCache.has(replacementPath)) {
    return replacementCache.get(replacementPath) ?? null;
  }

  try {
    const contents = readFileSync(replacementPath, 'utf8');
    replacementCache.set(replacementPath, contents);
    return contents;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[replace-node] failed to read replacement file:', replacementPath, message);
    return null;
  }
}

export function clearReplacementCache(): void {
  replacementCache.clear();
}
