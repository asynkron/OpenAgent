/** Utilities for converting AST locations into replaceable source ranges. */
import type { NodeLike, SourceLocation } from './types.js';

function isValidPosition(position: unknown): position is { line: number; column: number } {
  return (
    typeof position === 'object' &&
    position !== null &&
    typeof (position as { line?: unknown }).line === 'number' &&
    typeof (position as { column?: unknown }).column === 'number'
  );
}

function isValidLocation(loc: unknown): loc is SourceLocation {
  return (
    typeof loc === 'object' &&
    loc !== null &&
    ('start' in (loc as SourceLocation) || 'end' in (loc as SourceLocation))
  );
}

export function locToOffset(src: string, loc: SourceLocation | undefined): number | null {
  if (!loc || !isValidPosition(loc.start)) {
    return null;
  }

  const lines = src.split('\n');
  let offset = 0;
  for (let i = 0; i < loc.start.line - 1; i += 1) {
    offset += lines[i]?.length ?? 0;
    offset += 1; // include the newline
  }
  return offset + loc.start.column;
}

export function getNodeRange(node: NodeLike | null | undefined, src: string): [number, number] | null {
  if (!node) {
    return null;
  }

  if (typeof node.start === 'number' && typeof node.end === 'number') {
    return [node.start, node.end];
  }

  if (isValidLocation(node.loc) && isValidPosition(node.loc?.start) && isValidPosition(node.loc?.end)) {
    const startOffset = locToOffset(src, { start: node.loc.start });
    const endOffset = locToOffset(src, { start: node.loc.end });
    if (typeof startOffset === 'number' && typeof endOffset === 'number') {
      return [startOffset, endOffset];
    }
  }

  return null;
}

export function adjustRangeToLastClosingBrace(start: number, end: number, src: string): [number, number] {
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return [start, end];
  }

  const slice = src.slice(start, end);
  const lastInSlice = slice.lastIndexOf('}');
  let newEnd = end;
  if (lastInSlice !== -1) {
    newEnd = start + lastInSlice + 1;
  } else {
    const lastBrace = src.lastIndexOf('}', Math.max(0, end - 1));
    if (lastBrace >= start) {
      newEnd = lastBrace + 1;
    }
  }

  while (newEnd < src.length) {
    const ch = src.charAt(newEnd);
    if (ch === ';' || ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
      newEnd += 1;
    } else {
      break;
    }
  }

  return [start, newEnd];
}
