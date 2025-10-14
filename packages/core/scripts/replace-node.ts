/**
 * JSCodeshift transform that replaces class/function/method/variable declarations with
 * the contents of an external file. This entry point delegates to smaller helpers so
 * each concern remains testable while the CLI keeps the familiar `replace-node.ts` path.
 */
import { normalizeOptions } from './replace-node/args.js';
import { readReplacementFile } from './replace-node/fileCache.js';
import { collectMatchesForKind, applyMatches } from './replace-node/matches.js';
import type {
  CollectorContext,
  Match,
  ReplaceNodeOptions,
  TransformAPI,
  TransformFileInfo,
} from './replace-node/types.js';

const transform = (
  fileInfo: TransformFileInfo,
  api: TransformAPI,
  overrides?: Partial<ReplaceNodeOptions>,
): string | null => {
  const j = api.jscodeshift;
  const src = fileInfo.source;
  const root = j(src);

  const options = normalizeOptions(overrides);
  const { kind, replacementPath } = options;
  if (!kind || !replacementPath) {
    return null;
  }

  const replacement = readReplacementFile(options);
  if (replacement === null) {
    console.error('[replace-node] replacement file not readable; skipping file', fileInfo.path);
    return null;
  }

  const matches: Match[] = [];
  const context: CollectorContext = { j, root, src, options, matches };

  try {
    collectMatchesForKind(kind, context);
  } catch (error) {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
    console.error('[replace-node] error during AST walk:', message);
    return null;
  }

  return applyMatches(src, matches, replacement, options.matchIndex);
};

export default transform;
