import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';

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
  const [showCaret, setShowCaret] = useState(true);
  const [lastKeyEvent, setLastKeyEvent] = useState(() => ({
    rawInput: '',
    printableInput: '',
    specialKeys: [],
  }));
  const interactive = isActive && !isDisabled;

  const normalizedWidth = useMemo(() => Math.max(1, Math.floor(width ?? 1)), [width]);
  const maxIndex = value.length;

  useEffect(() => {
    setCaretIndex((prev) => clamp(prev, 0, maxIndex));
  }, [maxIndex]);

  const caretLine = Math.floor(caretIndex / normalizedWidth);
  const caretColumn = caretIndex % normalizedWidth;

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

      if (key.return) {
        onSubmit?.(value);
        return;
      }

      if (key.upArrow) {
        if (caretIndex === 0) {
          return;
        }
        const nextIndex = Math.max(0, caretIndex - normalizedWidth);
        setCaretIndex(nextIndex);
        return;
      }

      if (key.downArrow) {
        const nextIndex = Math.min(value.length, caretIndex + normalizedWidth);
        if (nextIndex === caretIndex) {
          return;
        }
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
        const rowStart = caretLine * normalizedWidth;
        const nextIndex = clamp(rowStart, 0, value.length);
        setCaretIndex(nextIndex);
        return;
      }

      if (key.end) {
        const rowStart = caretLine * normalizedWidth;
        const rowEnd = clamp(rowStart + normalizedWidth, 0, value.length);
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
      caretLine,
      interactive,
      normalizedWidth,
      onSubmit,
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

  const caretLineDisplay = caretLine + 1;
  const caretColumnDisplay = caretColumn + 1;

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
