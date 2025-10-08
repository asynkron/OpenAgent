import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Text, useInput } from 'ink';

const h = React.createElement;
const BLINK_INTERVAL_MS = 500;

function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function computePositions(text, width) {
  const safeWidth = Math.max(1, width | 0);
  const positions = [{ line: 0, column: 0 }];
  let line = 0;
  let column = 0;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char === '\n') {
      line += 1;
      column = 0;
      positions.push({ line, column });
      continue;
    }

    column += 1;
    if (column >= safeWidth) {
      column = 0;
      line += 1;
    }
    positions.push({ line, column });
  }

  return positions;
}

function findIndexForLineColumn(positions, targetLine, targetColumn) {
  let fallbackIndex = 0;
  for (let index = 0; index < positions.length; index += 1) {
    const pos = positions[index];
    if (pos.line === targetLine) {
      if (pos.column >= targetColumn) {
        return index;
      }
      fallbackIndex = index;
    } else if (pos.line > targetLine) {
      break;
    }
  }
  return fallbackIndex;
}

export function InkTextArea({
  value = '',
  onChange,
  onSubmit,
  placeholder = '',
  width = 60,
  isActive = true,
  isDisabled = false,
  ...textProps
}) {
  const [caretIndex, setCaretIndex] = useState(() => clamp(0, 0, value.length));
  const caretColumnRef = useRef(0);
  const [showCaret, setShowCaret] = useState(true);
  const interactive = isActive && !isDisabled;

  const positions = useMemo(() => computePositions(value, width), [value, width]);
  const maxIndex = positions.length - 1;

  useEffect(() => {
    setCaretIndex((prev) => clamp(prev, 0, maxIndex));
  }, [maxIndex, value]);

  const caretPosition = positions[caretIndex] ?? { line: 0, column: 0 };

  useEffect(() => {
    caretColumnRef.current = caretPosition.column;
  }, [caretPosition.column]);

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

  const updateValue = (nextValue, nextCaretIndex) => {
    const clampedIndex = clamp(nextCaretIndex, 0, nextValue.length);
    onChange?.(nextValue);
    setCaretIndex(clampedIndex);
  };

  useInput(
    (input, key) => {
      if (!interactive) {
        return;
      }

      if (key.return) {
        if (key.shift) {
          const nextValue = `${value.slice(0, caretIndex)}\n${value.slice(caretIndex)}`;
          updateValue(nextValue, caretIndex + 1);
          return;
        }
        onSubmit?.(value);
        return;
      }

      if (key.ctrl || key.meta) {
        return;
      }

      if (key.up) {
        const targetLine = Math.max(0, caretPosition.line - 1);
        if (targetLine === caretPosition.line) {
          return;
        }
        const nextIndex = findIndexForLineColumn(positions, targetLine, caretColumnRef.current);
        setCaretIndex(nextIndex);
        return;
      }

      if (key.down) {
        const targetLine = caretPosition.line + 1;
        const hasLine = positions.some((pos) => pos.line === targetLine);
        if (!hasLine) {
          return;
        }
        const nextIndex = findIndexForLineColumn(positions, targetLine, caretColumnRef.current);
        setCaretIndex(nextIndex);
        return;
      }

      if (key.left) {
        setCaretIndex((prev) => Math.max(0, prev - 1));
        return;
      }

      if (key.right) {
        setCaretIndex((prev) => Math.min(value.length, prev + 1));
        return;
      }

      if (key.home) {
        const nextIndex = findIndexForLineColumn(positions, caretPosition.line, 0);
        setCaretIndex(nextIndex);
        return;
      }

      if (key.end) {
        const targetLine = caretPosition.line;
        let nextIndex = caretIndex;
        for (let index = caretIndex; index < positions.length; index += 1) {
          if (positions[index].line !== targetLine) {
            break;
          }
          nextIndex = index;
        }
        setCaretIndex(nextIndex);
        return;
      }

      if (key.backspace) {
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

      if (input && input !== '\u0000') {
        const nextValue = `${value.slice(0, caretIndex)}${input}${value.slice(caretIndex)}`;
        updateValue(nextValue, caretIndex + input.length);
      }
    },
    { isActive: interactive },
  );

  const hasValue = value.length > 0;
  const caretGlyph = interactive && showCaret ? '▌' : '';
  const displaySource = hasValue ? value : placeholder;
  const insertionIndex = hasValue ? caretIndex : 0;

  const beforeCaret = displaySource.slice(0, insertionIndex);
  const afterCaret = displaySource.slice(insertionIndex);
  const composed = caretGlyph ? `${beforeCaret}${caretGlyph}${afterCaret}` : displaySource;

  const { dimColor, wrap, ...otherTextProps } = textProps;

  return h(
    Text,
    {
      wrap: wrap ?? 'wrap',
      dimColor: dimColor ?? !hasValue,
      ...otherTextProps,
    },
    composed,
  );
}

export default InkTextArea;
