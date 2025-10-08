import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';

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

const ARROW_LABELS = {
  upArrow: 'up',
  downArrow: 'down',
  leftArrow: 'left',
  rightArrow: 'right',
};

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
  const [lastKeyEvent, setLastKeyEvent] = useState(() => ({
    rawInput: '',
    printableInput: '',
    specialKeys: [],
  }));
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

  const updateValue = useCallback(
    (nextValue, nextCaretIndex) => {
      const clampedIndex = clamp(nextCaretIndex, 0, nextValue.length);
      onChange?.(nextValue);
      setCaretIndex(clampedIndex);
    },
    [onChange],
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

      const isShiftLineBreak = key.return && key.shift;
      const isLineFeed = input === '\n';

      if (isShiftLineBreak || isLineFeed) {
        const nextValue = `${value.slice(0, caretIndex)}\n${value.slice(caretIndex)}`;
        updateValue(nextValue, caretIndex + 1);
        return;
      }

      if (key.return && !specialKeys.shift) {
        onSubmit?.(value);
        return;
      }

      if (key.upArrow) {
        const targetLine = Math.max(0, caretPosition.line - 1);
        if (targetLine === caretPosition.line) {
          return;
        }
        const nextIndex = findIndexForLineColumn(positions, targetLine, caretColumnRef.current);
        setCaretIndex(nextIndex);
        return;
      }

      if (key.downArrow) {
        const targetLine = caretPosition.line + 1;
        const hasLine = positions.some((pos) => pos.line === targetLine);
        if (!hasLine) {
          return;
        }
        const nextIndex = findIndexForLineColumn(positions, targetLine, caretColumnRef.current);
        setCaretIndex(nextIndex);
        return;
      }

      if (key.leftArrow) {
        setCaretIndex((prev) => Math.max(0, prev - 1));
        return;
      }

      if (key.rightArrow) {
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

      if (input && input !== '\u0000') {
        const nextValue = `${value.slice(0, caretIndex)}${input}${value.slice(caretIndex)}`;
        updateValue(nextValue, caretIndex + input.length);
      }
    },
    [
      caretColumnRef,
      caretIndex,
      caretPosition.column,
      caretPosition.line,
      interactive,
      onSubmit,
      positions,
      updateValue,
      value,
    ],
  );

  useInput(handleInput, { isActive: interactive });

  const caretVisible = interactive && showCaret;
  const hasValue = value.length > 0;
  const displaySource = hasValue ? value : placeholder;
  const highlightIndex = hasValue ? caretIndex : 0;

  let textSegments;

  if (caretVisible) {
    if (hasValue) {
      const effectiveIndex = Math.min(highlightIndex, displaySource.length);
      const caretChar =
        effectiveIndex < displaySource.length ? displaySource[effectiveIndex] : ' ';
      const caretDisplay = caretChar === '\n' ? ' ' : caretChar || ' ';
      const afterStart = caretChar === '\n' ? effectiveIndex : Math.min(effectiveIndex + 1, displaySource.length);
      const beforeCaret = displaySource.slice(0, effectiveIndex);
      const afterCaret = displaySource.slice(afterStart);

      textSegments = [
        beforeCaret,
        h(Text, { inverse: true, key: 'caret-highlight' }, caretDisplay),
        afterCaret,
      ];
    } else {
      textSegments = [h(Text, { inverse: true, key: 'caret-highlight' }, ' '), displaySource];
    }
  } else {
    textSegments = [displaySource];
  }

  const caretLineDisplay = caretPosition.line + 1;
  const caretColumnDisplay = caretPosition.column + 1;

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

  const { dimColor, wrap, ...otherTextProps } = textProps;

  return h(
    Box,
    { flexDirection: 'column' },
    h(
      Text,
      {
        wrap: wrap ?? 'wrap',
        dimColor: dimColor ?? !hasValue,
        ...otherTextProps,
      },
      ...textSegments,
    ),
    h(
      Box,
      { flexDirection: 'column', marginTop: 1 },
      h(Text, { color: 'gray', dimColor: true, key: 'debug-heading' }, 'Debug info'),
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
