import type { Key } from 'ink';

export interface TextRow {
  text: string;
  startIndex: number;
}

export interface CaretPosition {
  rowIndex: number;
  column: number;
  row: TextRow;
}

export interface HorizontalPaddingInput {
  padding?: number;
  paddingX?: number;
  paddingLeft?: number;
  paddingRight?: number;
}

export const ARROW_LABELS: Record<string, string> = {
  upArrow: 'up',
  downArrow: 'down',
  leftArrow: 'left',
  rightArrow: 'right',
};

export const BLINK_INTERVAL_MS = 500;

export function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }

  if (value > max) {
    return max;
  }

  return value;
}

export function toNonNegativeInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
}

export function resolveHorizontalPadding({
  padding,
  paddingX,
  paddingLeft,
  paddingRight,
}: HorizontalPaddingInput): { paddingLeft: number; paddingRight: number } {
  const base = toNonNegativeInteger(padding);
  const horizontal = paddingX !== undefined ? toNonNegativeInteger(paddingX) : base;
  const left = paddingLeft !== undefined ? toNonNegativeInteger(paddingLeft) : horizontal;
  const right = paddingRight !== undefined ? toNonNegativeInteger(paddingRight) : horizontal;

  return { paddingLeft: left, paddingRight: right };
}

/**
 * Break a string into the visual rows rendered by the editor. Rows end either
 * because the terminal width was reached or a newline was encountered.
 */
export function transformToRows(
  source: string,
  maxWidth: number,
  options: { paddingLeft?: number; paddingRight?: number } = {},
): TextRow[] {
  const { paddingLeft = 0, paddingRight = 0 } = options;
  const safeWidth = Math.max(1, Math.floor(maxWidth ?? 1));
  const horizontalPadding = toNonNegativeInteger(paddingLeft) + toNonNegativeInteger(paddingRight);
  const effectiveWidth = Math.max(1, safeWidth - horizontalPadding);
  const rows: TextRow[] = [];

  let rowStartIndex = 0;
  let column = 0;
  let lastBreakWasNewline = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (char === '\n' || char === '\r') {
      const text = source.slice(rowStartIndex, index);
      rows.push({ text, startIndex: rowStartIndex });
      if (char === '\r' && source[index + 1] === '\n') {
        index += 1;
      }
      rowStartIndex = index + 1;
      column = 0;
      lastBreakWasNewline = true;
      continue;
    }

    column += 1;
    lastBreakWasNewline = false;

    if (column >= effectiveWidth) {
      const breakIndex = index + 1;
      const text = source.slice(rowStartIndex, breakIndex);
      rows.push({ text, startIndex: rowStartIndex });
      rowStartIndex = breakIndex;
      column = 0;
    }
  }

  const remainingText = source.slice(rowStartIndex);

  if (remainingText.length > 0 || rows.length === 0 || lastBreakWasNewline) {
    rows.push({ text: remainingText, startIndex: rowStartIndex });
  }

  return rows;
}

export function computeCaretPosition(
  rows: TextRow[],
  caretIndex: number,
  totalLength: number,
): CaretPosition {
  if (rows.length === 0) {
    const emptyRow: TextRow = { text: '', startIndex: 0 };
    return { rowIndex: 0, column: 0, row: emptyRow };
  }

  const clampedIndex = clamp(caretIndex, 0, totalLength);

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const nextRowStart = index + 1 < rows.length ? rows[index + 1].startIndex : totalLength;

    if (clampedIndex < nextRowStart || index === rows.length - 1) {
      const offset = Math.max(0, clampedIndex - row.startIndex);
      return {
        rowIndex: index,
        column: Math.min(offset, row.text.length),
        row,
      };
    }
  }

  const lastRow = rows[rows.length - 1];
  const offset = Math.max(0, clampedIndex - lastRow.startIndex);

  return {
    rowIndex: rows.length - 1,
    column: Math.min(offset, lastRow.text.length),
    row: lastRow,
  };
}

export interface LastKeyEvent {
  rawInput: string;
  printableInput: string;
  specialKeys: string[];
  shiftModifierActive: boolean;
}

export function extractSpecialKeys(key: Key | undefined): string[] {
  if (!key || typeof key !== 'object') {
    return [];
  }

  return Object.entries(key)
    .filter(([name, value]) => typeof value === 'boolean' && value && name !== 'isShiftPressed')
    .map(([name]) => ARROW_LABELS[name] ?? name);
}
