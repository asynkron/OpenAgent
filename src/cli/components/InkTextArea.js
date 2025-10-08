import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';

const h = React.createElement;
const BLINK_INTERVAL_MS = 500;

function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

const ARROW_LABELS = {
  upArrow: 'up',
  downArrow: 'down',
  leftArrow: 'left',
  rightArrow: 'right',
};

function toNonNegativeInteger(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}

function resolveHorizontalPadding({ padding, paddingX, paddingLeft, paddingRight }) {
  const base = toNonNegativeInteger(padding);
  const horizontal =
    paddingX !== undefined ? toNonNegativeInteger(paddingX) : base;
  const left =
    paddingLeft !== undefined ? toNonNegativeInteger(paddingLeft) : horizontal;
  const right =
    paddingRight !== undefined ? toNonNegativeInteger(paddingRight) : horizontal;
  return { paddingLeft: left, paddingRight: right };
}

function extractSpecialKeys(key) {
  if (!key || typeof key !== 'object') {
    return [];
  }

  return Object.entries(key)
    .filter((entry) => {
      const [name, value] = entry;
      return typeof value === 'boolean' && value && name !== 'isShiftPressed';
    })
    .map(([name]) => ARROW_LABELS[name] ?? name);
}

/**
 * Break a string into the visual rows rendered by the editor.
 * Rows end either because the terminal width was reached or a newline was encountered.
 */
export function transformToRows(source, maxWidth, options = {}) {
  const { paddingLeft = 0, paddingRight = 0 } = options ?? {};
  const safeWidth = Math.max(1, Math.floor(maxWidth ?? 1));
  const horizontalPadding =
    toNonNegativeInteger(paddingLeft) + toNonNegativeInteger(paddingRight);
  const effectiveWidth = Math.max(1, safeWidth - horizontalPadding);
  const rows = [];

  let rowStartIndex = 0;
  let column = 0;
  let lastBreakWasNewline = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (char === '\n') {
      const text = source.slice(rowStartIndex, index);
      rows.push({
        text,
        startIndex: rowStartIndex,
      });
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
      rows.push({
        text,
        startIndex: rowStartIndex,
      });
      rowStartIndex = breakIndex;
      column = 0;
    }
  }

  const remainingText = source.slice(rowStartIndex);

  if (remainingText.length > 0 || rows.length === 0 || lastBreakWasNewline) {
    rows.push({
      text: remainingText,
      startIndex: rowStartIndex,
    });
  }

  return rows;
}

function computeCaretPosition(rows, caretIndex, totalLength) {
  if (rows.length === 0) {
    return {
      rowIndex: 0,
      column: 0,
      row: { text: '', startIndex: 0 },
    };
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

export function InkTextArea({
  value = '',
  onChange,
  onSubmit,
  placeholder = '',
  width,
  isActive = true,
  isDisabled = false,
  ...rest
}) {
  const {
    padding,
    paddingX,
    paddingY,
    paddingLeft,
    paddingRight,
    paddingTop,
    paddingBottom,
    margin,
    marginX,
    marginY,
    marginLeft,
    marginRight,
    marginTop,
    marginBottom,
    borderColor,
    borderStyle,
    borderTop,
    borderBottom,
    borderLeft,
    borderRight,
    ...textProps
  } = rest;
  const [caretIndex, setCaretIndex] = useState(() => clamp(0, 0, value.length));
  const [showCaret, setShowCaret] = useState(true);
  const [lastKeyEvent, setLastKeyEvent] = useState(() => ({
    rawInput: '',
    printableInput: '',
    specialKeys: [],
  }));
  const desiredColumnRef = useRef(null);
  const interactive = isActive && !isDisabled;

  const { stdout } = useStdout();
  const [measuredWidth, setMeasuredWidth] = useState(() =>
    stdout && Number.isFinite(stdout.columns) ? Math.floor(stdout.columns) : undefined,
  );

  useEffect(() => {
    if (!stdout) {
      setMeasuredWidth(undefined);
      return undefined;
    }

    const handleResize = () => {
      if (Number.isFinite(stdout.columns)) {
        setMeasuredWidth(Math.floor(stdout.columns));
      } else {
        setMeasuredWidth(undefined);
      }
    };

    handleResize();
    stdout.on('resize', handleResize);

    return () => {
      if (typeof stdout.off === 'function') {
        stdout.off('resize', handleResize);
      } else {
        stdout.removeListener?.('resize', handleResize);
      }
    };
  }, [stdout]);

  const normalizedWidth = useMemo(() => {
    if (typeof width === 'number' && Number.isFinite(width)) {
      return Math.max(1, Math.floor(width));
    }

    if (typeof measuredWidth === 'number') {
      return Math.max(1, Math.floor(measuredWidth));
    }

    return 60;
  }, [measuredWidth, width]);
  const maxIndex = value.length;

  useEffect(() => {
    setCaretIndex((prev) => clamp(prev, 0, maxIndex));
  }, [maxIndex]);

  const { paddingLeft: resolvedPaddingLeft, paddingRight: resolvedPaddingRight } =
    useMemo(
      () =>
        resolveHorizontalPadding({
          padding,
          paddingX,
          paddingLeft,
          paddingRight,
        }),
      [padding, paddingLeft, paddingRight, paddingX],
    );

  const effectiveWidth = useMemo(
    () => Math.max(1, normalizedWidth - resolvedPaddingLeft - resolvedPaddingRight),
    [normalizedWidth, resolvedPaddingLeft, resolvedPaddingRight],
  );

  const rows = useMemo(
    () =>
      transformToRows(value, normalizedWidth, {
        paddingLeft: resolvedPaddingLeft,
        paddingRight: resolvedPaddingRight,
      }),
    [normalizedWidth, resolvedPaddingLeft, resolvedPaddingRight, value],
  );
  const caretPosition = useMemo(
    () => computeCaretPosition(rows, caretIndex, value.length),
    [caretIndex, rows, value.length],
  );
  const caretLine = caretPosition.rowIndex;
  const caretColumn = caretPosition.column;

  const resetDesiredColumn = useCallback(() => {
    desiredColumnRef.current = null;
  }, []);

  useEffect(() => {
    if (!interactive) {
      setShowCaret(false);
      return undefined;
    }

    setShowCaret(true);
    const interval = setInterval(() => {
      setShowCaret((prev) => !prev);
    }, BLINK_INTERVAL_MS);

    return () => {
      clearInterval(interval);
    };
  }, [interactive]);

  const updateValue = useCallback(
    (nextValue, nextCaretIndex) => {
      const clampedIndex = clamp(nextCaretIndex, 0, nextValue.length);
      resetDesiredColumn();
      onChange?.(nextValue);
      setCaretIndex(clampedIndex);
    },
    [onChange, resetDesiredColumn],
  );

  const handleInput = useCallback(
    (input, key) => {
      if (!interactive) {
        return;
      }

      const printableInput = input && input !== '\u0000' ? input : '';
      const specialKeys = extractSpecialKeys(key);

      setLastKeyEvent({
        rawInput: input,
        printableInput,
        specialKeys,
      });

      if (key.ctrl || key.meta) {
        return;
      }

      if (key.return) {
        onSubmit?.(value);
        return;
      }

      if (key.upArrow) {
        const currentRowIndex = caretPosition.rowIndex;

        if (currentRowIndex === 0) {
          return;
        }
        const targetRow = rows[currentRowIndex - 1];
        const desiredColumn = desiredColumnRef.current ?? caretPosition.column;
        desiredColumnRef.current = desiredColumn;
        const nextColumn = Math.min(desiredColumn, targetRow.text.length);
        const nextIndex = targetRow.startIndex + nextColumn;
        setCaretIndex(nextIndex);
        return;
      }

      if (key.downArrow) {
        const currentRowIndex = caretPosition.rowIndex;

        if (currentRowIndex >= rows.length - 1) {
          return;
        }
        const targetRow = rows[currentRowIndex + 1];
        const desiredColumn = desiredColumnRef.current ?? caretPosition.column;
        desiredColumnRef.current = desiredColumn;
        const nextColumn = Math.min(desiredColumn, targetRow.text.length);
        const nextIndex = targetRow.startIndex + nextColumn;
        setCaretIndex(nextIndex);
        return;
      }

      desiredColumnRef.current = null;

      if (key.leftArrow) {
        setCaretIndex((prev) => Math.max(0, prev - 1));
        return;
      }

      if (key.rightArrow) {
        setCaretIndex((prev) => Math.min(value.length, prev + 1));
        return;
      }

      if (key.home) {
        const rowStart = caretPosition.row.startIndex;
        const nextIndex = clamp(rowStart, 0, value.length);
        setCaretIndex(nextIndex);
        return;
      }

      if (key.end) {
        const rowStart = caretPosition.row.startIndex;
        const rowEnd = clamp(rowStart + caretPosition.row.text.length, 0, value.length);
        const nextIndex = Math.max(rowStart, rowEnd);
        setCaretIndex(nextIndex);
        return;
      }

      const isBackwardDelete = key.backspace || (key.delete && !key.code);

      if (isBackwardDelete) {
        if (caretIndex === 0) {
          return;
        }
        const nextValue = `${value.slice(0, caretIndex - 1)}${value.slice(caretIndex)}`;
        updateValue(nextValue, caretIndex - 1);
        return;
      }

      if (key.delete) {
        if (caretIndex >= value.length) {
          return;
        }
        const nextValue = `${value.slice(0, caretIndex)}${value.slice(caretIndex + 1)}`;
        updateValue(nextValue, caretIndex);
        return;
      }

      if (input && input !== '\u0000' && input !== '\n') {
        const nextValue = `${value.slice(0, caretIndex)}${input}${value.slice(caretIndex)}`;
        updateValue(nextValue, caretIndex + input.length);
      }
    },
    [
      caretIndex,
      caretPosition,
      interactive,
      onSubmit,
      resetDesiredColumn,
      rows,
      updateValue,
      value,
    ],
  );

  useInput(handleInput, { isActive: interactive });

  const caretVisible = interactive && showCaret;
  const hasValue = value.length > 0;
  const displayRows = useMemo(() => {
    if (hasValue) {
      return rows;
    }
    return transformToRows(placeholder, normalizedWidth, {
      paddingLeft: resolvedPaddingLeft,
      paddingRight: resolvedPaddingRight,
    });
  }, [
    hasValue,
    normalizedWidth,
    placeholder,
    resolvedPaddingLeft,
    resolvedPaddingRight,
    rows,
  ]);

  const textStyle = useMemo(() => {
    const { dimColor, wrap, ...otherTextProps } = textProps;

    return {
      wrap: wrap ?? 'wrap',
      dimColor: dimColor ?? !hasValue,
      ...otherTextProps,
    };
  }, [hasValue, textProps]);

  const caretRowIndex = hasValue ? caretLine : 0;
  const caretColumnDisplay = caretColumn + 1;
  const caretLineDisplay = caretLine + 1;
  const widthPropDisplay = useMemo(
    () => (typeof width === 'number' && Number.isFinite(width) ? Math.floor(width) : 'n/a'),
    [width],
  );
  const measuredWidthDisplay = useMemo(
    () => (typeof measuredWidth === 'number' ? measuredWidth : 'n/a'),
    [measuredWidth],
  );

  const rowElements = displayRows.map((row, rowIndex) => {
    const key = `row-${row.startIndex}-${rowIndex}`;
    const isCaretRow = caretVisible && rowIndex === caretRowIndex;

    if (!isCaretRow) {
      const textContent = row.text.length > 0 ? row.text : ' ';
      return h(Text, { key, ...textStyle }, textContent);
    }

    if (!hasValue) {
      const placeholderSegments = [h(Text, { inverse: true, key: 'caret-highlight' }, ' ')];
      if (row.text.length > 0) {
        placeholderSegments.push(row.text);
      }
      return h(Text, { key, ...textStyle }, ...placeholderSegments);
    }

    const caretColumnIndex = caretColumn;
    const beforeCaret = row.text.slice(0, caretColumnIndex);
    const caretChar = row.text[caretColumnIndex];
    const caretDisplay = caretChar ?? ' ';
    const afterStart = caretChar ? caretColumnIndex + 1 : caretColumnIndex;
    const afterCaret = row.text.slice(afterStart);
    const segments = [];

    if (beforeCaret.length > 0) {
      segments.push(beforeCaret);
    }

    segments.push(h(Text, { inverse: true, key: 'caret-highlight' }, caretDisplay));

    if (afterCaret.length > 0) {
      segments.push(afterCaret);
    }

    if (segments.length === 1 && caretDisplay === ' ') {
      segments.push('');
    }

    return h(Text, { key, ...textStyle }, ...segments);
  });

  const lastKeyDisplay = useMemo(() => {
    if (lastKeyEvent.printableInput) {
      return lastKeyEvent.printableInput;
    }
    if (lastKeyEvent.specialKeys.length > 0) {
      return lastKeyEvent.specialKeys.join(' + ');
    }
    return 'n/a';
  }, [lastKeyEvent]);

  const modifierKeys = useMemo(
    () =>
      lastKeyEvent.specialKeys.filter((name) =>
        ['shift', 'ctrl', 'meta', 'alt', 'option', 'super'].includes(name),
      ),
    [lastKeyEvent.specialKeys],
  );

  const containerProps = useMemo(() => {
    const style = {
      flexDirection: 'column',
      width: '100%',
      alignSelf: 'stretch',
    };

    const boxOptions = {
      padding,
      paddingX,
      paddingY,
      paddingLeft,
      paddingRight,
      paddingTop,
      paddingBottom,
      margin,
      marginX,
      marginY,
      marginLeft,
      marginRight,
      marginTop,
      marginBottom,
      borderColor,
      borderStyle,
      borderTop,
      borderBottom,
      borderLeft,
      borderRight,
    };

    for (const [key, value] of Object.entries(boxOptions)) {
      if (value !== undefined) {
        style[key] = value;
      }
    }

    return style;
  }, [
    borderBottom,
    borderColor,
    borderLeft,
    borderRight,
    borderStyle,
    borderTop,
    margin,
    marginBottom,
    marginLeft,
    marginRight,
    marginTop,
    marginX,
    marginY,
    padding,
    paddingBottom,
    paddingLeft,
    paddingRight,
    paddingTop,
    paddingX,
    paddingY,
  ]);

  return h(
    Box,
    containerProps,
    h(Box, { flexDirection: 'column', width: '100%' }, ...rowElements),
    h(
      Box,
      { flexDirection: 'column', marginTop: 1 },
      h(Text, { color: 'gray', dimColor: true, key: 'debug-heading' }, 'Debug info'),
      h(
        Text,
        { color: 'gray', key: 'debug-width' },
        `Width: ${normalizedWidth} (effective: ${effectiveWidth}, prop: ${widthPropDisplay}, measured: ${measuredWidthDisplay})`,
      ),
      h(
        Text,
        { color: 'gray', key: 'debug-caret' },
        `Caret: line ${caretLineDisplay}, column ${caretColumnDisplay}, index ${caretIndex}`,
      ),
      h(Text, { color: 'gray', key: 'debug-last-key' }, `Last key: ${lastKeyDisplay}`),
      h(
        Text,
        { color: 'gray', key: 'debug-modifiers' },
        `Special keys: ${modifierKeys.length > 0 ? modifierKeys.join(', ') : 'none'}`,
      ),
    ),
  );
}

export default InkTextArea;
