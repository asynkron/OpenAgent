import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Key } from 'ink';

import {
  clamp,
  computeCaretPosition,
  resolveHorizontalPadding,
  transformToRows,
  type CaretPosition,
  type HorizontalPaddingInput,
  type LastKeyEvent,
  type TextRow,
} from './inkTextArea/layout.js';
import {
  createDeletionHandler,
  createMovementHandler,
  evaluateKeyEvent,
  type PreviousKeySnapshot,
} from './inkTextArea/keyEvents.js';
import type { SlashCommandDefinition, SlashCommandSourceItem } from './inkTextArea/commands.js';
import { CommandMenu } from './inkTextArea/CommandMenu.js';
import { useCaretBlink } from './inkTextArea/useCaretBlink.js';
import { useCommandMenu } from './inkTextArea/useCommandMenu.js';
import { useStdoutWidth } from './inkTextArea/useStdoutWidth.js';
import type { SlashCommandSelectEvent } from './inkTextArea/types.js';
import { toBoxProps, toTextProps, type BoxStyleProps, type TextStyleProps } from '../styleTypes.js';

type LegacySlashMenuItem = SlashCommandSourceItem;

export interface InkTextAreaProps extends HorizontalPaddingInput, BoxStyleProps {
  value?: string;
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
  placeholder?: string;
  width?: number;
  isActive?: boolean;
  isDisabled?: boolean;
  slashMenuItems?: ReadonlyArray<LegacySlashMenuItem>;
  commandMenus?: ReadonlyArray<SlashCommandDefinition>;
  onSlashCommandSelect?: (event: SlashCommandSelectEvent) => void;
  textProps?: TextStyleProps;
  debug?: boolean;
  showDebugMetrics?: boolean;
  commandMenuTitle?: string;
}

function InkTextArea(props: InkTextAreaProps) {
  const {
    value = '',
    onChange,
    onSubmit,
    placeholder = '',
    width,
    isActive = true,
    isDisabled = false,
    slashMenuItems,
    commandMenus,
    onSlashCommandSelect,
    textProps: explicitTextProps,
    debug = false,
    showDebugMetrics = false,
    commandMenuTitle,
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
  } = props;

  const textStyle: TextStyleProps = { ...(explicitTextProps ?? {}) };
  const textProps = toTextProps(textStyle);

  const interactive = isActive && !isDisabled;
  const [caretIndex, setCaretIndex] = useState(() => clamp(0, 0, value.length));
  const showCaret = useCaretBlink(interactive);
  const [lastKeyEvent, setLastKeyEvent] = useState<LastKeyEvent>(() => ({
    rawInput: '',
    printableInput: '',
    specialKeys: [],
    shiftModifierActive: false,
  }));
  const lastKeyEventRef = useRef<PreviousKeySnapshot>({
    printableInput: '',
    wasReturnKey: false,
    shiftModifierActive: false,
  });
  const desiredColumnRef = useRef<number | null>(null);

  const { measuredWidth, normalizedWidth } = useStdoutWidth(width);

  const maxIndex = value.length;

  useEffect(() => {
    setCaretIndex((previous) => clamp(previous, 0, maxIndex));
  }, [maxIndex]);

  const { paddingLeft: resolvedPaddingLeft, paddingRight: resolvedPaddingRight } = useMemo(
    () =>
      resolveHorizontalPadding({
        padding: padding as number | undefined,
        paddingX: paddingX as number | undefined,
        paddingLeft: paddingLeft as number | undefined,
        paddingRight: paddingRight as number | undefined,
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

  const caretPosition = useMemo<CaretPosition>(
    () => computeCaretPosition(rows, caretIndex, value.length),
    [caretIndex, rows, value.length],
  );

  const resetDesiredColumn = useCallback(() => {
    desiredColumnRef.current = null;
  }, []);

  const updateValue = useCallback(
    (nextValue: string, nextCaretIndex: number) => {
      const clampedIndex = clamp(nextCaretIndex, 0, nextValue.length);
      resetDesiredColumn();
      onChange?.(nextValue);
      setCaretIndex(clampedIndex);
    },
    [onChange, resetDesiredColumn],
  );

  const {
    matches: commandMatches,
    isVisible: commandMenuVisible,
    highlightMatch: resolvedCommandHighlight,
    handleNavigation: handleCommandNavigation,
  } = useCommandMenu({
    value,
    caretIndex,
    slashMenuItems,
    commandMenus,
    onSlashCommandSelect,
    updateValue,
  });

  const handleArrowUp = useCallback(() => {
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
  }, [caretPosition, rows, desiredColumnRef, setCaretIndex]);

  const handleArrowDown = useCallback(() => {
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
  }, [caretPosition, rows, desiredColumnRef, setCaretIndex]);

  const handleArrowLeft = useCallback(() => {
    setCaretIndex((prev) => Math.max(0, prev - 1));
  }, [setCaretIndex]);

  const handleArrowRight = useCallback(() => {
    setCaretIndex((prev) => Math.min(value.length, prev + 1));
  }, [setCaretIndex, value.length]);

  const handleHome = useCallback(() => {
    const rowStart = caretPosition.row.startIndex;
    const nextIndex = clamp(rowStart, 0, value.length);
    setCaretIndex(nextIndex);
  }, [caretPosition, setCaretIndex, value.length]);

  const handleEnd = useCallback(() => {
    const rowStart = caretPosition.row.startIndex;
    const rowEnd = clamp(rowStart + caretPosition.row.text.length, 0, value.length);
    const nextIndex = Math.max(rowStart, rowEnd);
    setCaretIndex(nextIndex);
  }, [caretPosition, setCaretIndex, value.length]);

  // Consolidate navigation keys so the input handler just routes high-level actions.
  const handleMovementKey = useMemo(
    () =>
      createMovementHandler({
        onUp: handleArrowUp,
        onDown: handleArrowDown,
        onLeft: () => {
          desiredColumnRef.current = null;
          handleArrowLeft();
        },
        onRight: () => {
          desiredColumnRef.current = null;
          handleArrowRight();
        },
        onHome: handleHome,
        onEnd: handleEnd,
      }),
    [
      desiredColumnRef,
      handleArrowDown,
      handleArrowLeft,
      handleArrowRight,
      handleArrowUp,
      handleEnd,
      handleHome,
    ],
  );

  const handleBackspace = useCallback(() => {
    if (caretIndex === 0) {
      return;
    }
    const nextValue = `${value.slice(0, caretIndex - 1)}${value.slice(caretIndex)}`;
    updateValue(nextValue, caretIndex - 1);
  }, [caretIndex, updateValue, value]);

  const handleDelete = useCallback(() => {
    if (caretIndex >= value.length) {
      return;
    }
    const nextValue = `${value.slice(0, caretIndex)}${value.slice(caretIndex + 1)}`;
    updateValue(nextValue, caretIndex);
  }, [caretIndex, updateValue, value]);

  // Normalize backward/forward delete handling before mutating the buffer.
  const handleDeletionKey = useMemo(
    () =>
      createDeletionHandler({
        onBackwardDelete: handleBackspace,
        onDelete: handleDelete,
      }),
    [handleBackspace, handleDelete],
  );

  const handleInsertText = useCallback(
    (input: string) => {
      if (input && input !== '\u0000' && input !== '\n') {
        const nextValue = `${value.slice(0, caretIndex)}${input}${value.slice(caretIndex)}`;
        updateValue(nextValue, caretIndex + input.length);
      }
    },
    [caretIndex, updateValue, value],
  );

  const handleInsertNewline = useCallback(() => {
    const nextValue = `${value.slice(0, caretIndex)}\n${value.slice(caretIndex)}`;
    updateValue(nextValue, caretIndex + 1);
  }, [caretIndex, updateValue, value]);

  const handleInput = useCallback(
    (input: string, key: Key) => {
      if (!interactive) {
        return;
      }

      const evaluation = evaluateKeyEvent(input, key, lastKeyEventRef.current);

      lastKeyEventRef.current = {
        printableInput: evaluation.printableInput,
        wasReturnKey: Boolean(key?.return),
        shiftModifierActive: evaluation.shiftModifierActive,
      };

      setLastKeyEvent({
        rawInput: input,
        printableInput: evaluation.printableInput,
        specialKeys: evaluation.specialKeys,
        shiftModifierActive: evaluation.shiftModifierActive,
      });

      const commandNavigationHandled = handleCommandNavigation(key, evaluation.shouldInsertNewline);

      if (commandNavigationHandled) {
        return;
      }

      if (key.ctrl || key.meta) {
        return;
      }

      if (key.return && !evaluation.shouldInsertNewline) {
        onSubmit?.(value);
        return;
      }

      if (evaluation.shouldInsertNewline) {
        handleInsertNewline();
        return;
      }

      if (handleMovementKey(key)) {
        return;
      }

      if (handleDeletionKey(key)) {
        return;
      }

      handleInsertText(input);
    },
    [
      handleCommandNavigation,
      interactive,
      onSubmit,
      value,
      handleInsertNewline,
      handleMovementKey,
      handleDeletionKey,
      handleInsertText,
      setLastKeyEvent,
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
  }, [hasValue, normalizedWidth, placeholder, resolvedPaddingLeft, resolvedPaddingRight, rows]);

  const computedTextProps = useMemo(() => {
    const { dimColor, wrap, ...otherTextProps } = textProps;

    return {
      wrap:
        (wrap as
          | 'wrap'
          | 'end'
          | 'middle'
          | 'truncate-end'
          | 'truncate'
          | 'truncate-middle'
          | 'truncate-start') ?? 'wrap',
      dimColor: (dimColor as boolean) ?? !hasValue,
      ...otherTextProps,
    };
  }, [hasValue, textProps]);

  const caretRowIndex = hasValue ? caretPosition.rowIndex : 0;
  const caretColumnDisplay = caretPosition.column + 1;
  const caretLineDisplay = caretRowIndex + 1;

  const rowElements = displayRows.map((row: TextRow, index: number) => {
    const isCaretRow = caretVisible && index === caretRowIndex;
    const caretColumn = caretPosition.column;
    const key = `row-${row.startIndex}-${index}`;

    if (!isCaretRow) {
      const textContent = row.text.length > 0 ? row.text : ' ';
      return (
        <Box key={key} flexDirection="row" width="100%">
          <Text {...computedTextProps}>{textContent}</Text>
        </Box>
      );
    }

    if (!hasValue) {
      const segments = [
        <Text key="caret" inverse={caretVisible} {...computedTextProps}>
          {' '}
        </Text>,
      ];

      if (row.text.length > 0) {
        segments.push(
          <Text key="placeholder" {...computedTextProps}>
            {row.text}
          </Text>,
        );
      }

      return (
        <Box key={key} flexDirection="row" width="100%">
          {segments}
        </Box>
      );
    }

    const beforeCaret = row.text.slice(0, caretColumn);
    const caretChar = row.text[caretColumn];
    const caretDisplay = caretChar ?? ' ';
    const afterStart = caretChar ? caretColumn + 1 : caretColumn;
    const afterCaret = row.text.slice(afterStart);
    const segments = [];

    if (beforeCaret.length > 0) {
      segments.push(
        <Text key="before" {...computedTextProps}>
          {beforeCaret}
        </Text>,
      );
    }

    segments.push(
      <Text key="caret" inverse={caretVisible} {...computedTextProps}>
        {caretDisplay}
      </Text>,
    );

    if (afterCaret.length > 0) {
      segments.push(
        <Text key="after" {...computedTextProps}>
          {afterCaret}
        </Text>,
      );
    }

    if (segments.length === 1 && caretDisplay === ' ') {
      segments.push(
        <Text key="padding" {...computedTextProps}>
          {''}
        </Text>,
      );
    }

    return (
      <Box key={key} flexDirection="row" width="100%">
        {segments}
      </Box>
    );
  });

  const commandMenuElement = (
    <CommandMenu
      matches={commandMatches}
      activeMatch={resolvedCommandHighlight}
      isVisible={commandMenuVisible}
      title={commandMenuTitle}
    />
  );

  const shouldRenderDebug = debug || showDebugMetrics || process.env.NODE_ENV === 'test';
  const modifierKeys = lastKeyEvent.specialKeys;
  const widthPropDisplay = typeof width === 'number' ? String(width) : 'auto';
  const measuredWidthDisplay = measuredWidth ? String(measuredWidth) : 'n/a';
  const lastKeyDisplay = lastKeyEvent.printableInput || lastKeyEvent.rawInput || 'none';

  const debugElement = shouldRenderDebug ? (
    <Box flexDirection="column" marginTop={1}>
      <Text color="gray" dimColor>
        Debug info
      </Text>
      <Text color="gray">{`Width: ${normalizedWidth} (effective: ${effectiveWidth}, prop: ${widthPropDisplay}, measured: ${measuredWidthDisplay})`}</Text>
      <Text color="gray">{`Caret: line ${caretLineDisplay}, column ${caretColumnDisplay}, index ${caretIndex}`}</Text>
      <Text color="gray">{`Last key: ${lastKeyDisplay}`}</Text>
      <Text color="gray">{`Special keys: ${modifierKeys.length > 0 ? modifierKeys.join(', ') : 'none'}`}</Text>
    </Box>
  ) : null;

  const containerStyle: BoxStyleProps = {
    flexDirection: 'column',
    width: '100%',
    alignSelf: 'stretch',
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

  const containerProps = toBoxProps(containerStyle);

  return (
    <Box {...containerProps}>
      <Box flexDirection="column" width="100%">
        {rowElements}
      </Box>
      {commandMenuElement}
      {debugElement}
    </Box>
  );
}

export { transformToRows } from './inkTextArea/layout.js';
export default InkTextArea;
