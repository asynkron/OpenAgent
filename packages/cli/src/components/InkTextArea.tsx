import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Key, TextProps } from 'ink';

import {
  clamp,
  computeCaretPosition,
  resolveHorizontalPadding,
  transformToRows,
  type CaretPosition,
  type HorizontalPaddingInput,
  type LastKeyEvent,
} from './inkTextArea/layout.js';
import {
  createDeletionHandler,
  evaluateKeyEvent,
  type PreviousKeySnapshot,
} from './inkTextArea/keyEvents.js';
import type { SlashCommandDefinition, SlashCommandSourceItem } from './inkTextArea/commands.js';
import { CommandMenu } from './inkTextArea/CommandMenu.js';
import { useCommandMenu } from './inkTextArea/useCommandMenu.js';
import { useStdoutWidth } from './inkTextArea/useStdoutWidth.js';
import type { SlashCommandSelectEvent } from './inkTextArea/types.js';
import { useCaretNavigation } from './inkTextArea/useCaretNavigation.js';
import { renderRows } from './inkTextArea/renderRows.js';
import { toBoxProps, toTextProps, type BoxStyleProps, type TextStyleProps } from '../styleTypes.js';
import type { TextRow } from './inkTextArea/layout.js';

type LegacySlashMenuItem = SlashCommandSourceItem;

export interface InkTextAreaProps extends HorizontalPaddingInput, BoxStyleProps {
  value?: string;
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
  placeholder?: string;
  width?: number;
  widthOffset?: number;
  isActive?: boolean;
  isDisabled?: boolean;
  slashMenuItems?: ReadonlyArray<LegacySlashMenuItem>;
  commandMenus?: ReadonlyArray<SlashCommandDefinition>;
  onSlashCommandSelect?: (event: SlashCommandSelectEvent) => void;
  textProps?: TextStyleProps;
  debug?: boolean;
  showDebugMetrics?: boolean;
  commandMenuTitle?: string;
  debounceOnChangeMs?: number;
  // Maximum visible rows for the input; content scrolls internally when exceeded
  maxRows?: number;
}

function InkTextArea(props: InkTextAreaProps) {
  const {
    value: externalValue = '',
    onChange,
    onSubmit,
    placeholder = '',
    width,
    widthOffset,
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
    debounceOnChangeMs,
    maxRows,
  } = props;

  const textStyle: TextStyleProps = { ...(explicitTextProps ?? {}) };
  const textProps = toTextProps(textStyle);

  const interactive = isActive && !isDisabled;

  // Local echo to avoid tying typing responsiveness to parent re-renders
  const [value, setValue] = useState<string>(externalValue);
  useEffect(() => {
    if (externalValue !== value) {
      setValue(externalValue);
    }
  }, [externalValue]);

  const onChangeDelay = typeof debounceOnChangeMs === 'number' && Number.isFinite(debounceOnChangeMs)
    ? Math.max(0, Math.floor(debounceOnChangeMs))
    : 0;
  const onChangeTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [caretIndex, setCaretIndex] = useState<number>(() => clamp(0, 0, value.length));
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

  const { measuredWidth, normalizedWidth } = useStdoutWidth(width, {
    horizontalOffset: widthOffset,
  });

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
      setValue(nextValue);
      setCaretIndex(clampedIndex);
      if (onChange) {
        if (onChangeTimerRef.current) {
          clearTimeout(onChangeTimerRef.current);
          onChangeTimerRef.current = null;
        }
        if (onChangeDelay === 0) {
          onChange(nextValue);
        } else {
          onChangeTimerRef.current = setTimeout(() => onChange(nextValue), onChangeDelay);
        }
      }
    },
    [onChange, onChangeDelay, resetDesiredColumn],
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

  const handleMovementKey = useCaretNavigation({
    caretPosition,
    rows,
    valueLength: maxIndex,
    desiredColumnRef,
    setCaretIndex,
  });

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

  useEffect(() => {
    // cleanup on unmount for onChange timer
    return () => {
      if (onChangeTimerRef.current) {
        clearTimeout(onChangeTimerRef.current);
        onChangeTimerRef.current = null;
      }
    };
  }, []);

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
    } as TextProps;
  }, [hasValue, textProps]);

  const caretRowIndex = hasValue ? caretPosition.rowIndex : 0;
  const maxVisibleRows = useMemo(() => {
    const v = typeof maxRows === 'number' && Number.isFinite(maxRows) ? Math.max(1, Math.floor(maxRows)) : 6;
    return v;
  }, [maxRows]);

  const caretColumnDisplay = caretPosition.column + 1;
  const caretLineDisplay = caretRowIndex + 1;

  // Keep a stable-height window of rows so typing does not grow layout
  const firstVisibleRowIndex = useMemo(() => {
    // Prefer to keep caret on last line of the window when possible
    const start = Math.max(0, caretRowIndex - (maxVisibleRows - 1));
    return start;
  }, [caretRowIndex, maxVisibleRows]);

  const visibleRows = useMemo(() => {
    const src = displayRows;
    if (src.length <= maxVisibleRows) return src;
    return src.slice(firstVisibleRowIndex, firstVisibleRowIndex + maxVisibleRows);
  }, [displayRows, firstVisibleRowIndex, maxVisibleRows]);


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
      <InkTextAreaRows
        rows={visibleRows}
        caretPosition={caretPosition}
        caretRowIndex={Math.min(caretRowIndex - firstVisibleRowIndex, maxVisibleRows - 1)}
        hasValue={hasValue}
        textProps={computedTextProps}
        interactive={interactive}
        maxVisibleRows={maxVisibleRows}
      />
      {commandMenuElement}
      {debugElement}
    </Box>
  );
}

type InkTextAreaRowsProps = {
  rows: ReadonlyArray<TextRow>;
  caretPosition: CaretPosition;
  caretRowIndex: number;
  hasValue: boolean;
  textProps: TextProps;
  interactive: boolean;
  maxVisibleRows: number;
};

function InkTextAreaRowsComponent({
  rows,
  caretPosition,
  caretRowIndex,
  hasValue,
  textProps,
  interactive,
  maxVisibleRows,
}: InkTextAreaRowsProps) {
  const caretVisible = interactive;

  const rowElements = useMemo(
    () =>
      renderRows({
        rows,
        caretPosition,
        caretRowIndex,
        caretVisible,
        hasValue,
        textProps,
      }),
    [rows, caretPosition, caretRowIndex, caretVisible, hasValue, textProps],
  );

  return (
    <Box flexDirection="column" width="100%" height={maxVisibleRows}>
      {rowElements}
    </Box>
  );
}

const InkTextAreaRows = memo(InkTextAreaRowsComponent);

export { transformToRows } from './inkTextArea/layout.js';
export default memo(InkTextArea);
