// @ts-nocheck
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import type { Key } from 'ink';

import {
  BLINK_INTERVAL_MS,
  clamp,
  computeCaretPosition,
  extractSpecialKeys,
  resolveHorizontalPadding,
  transformToRows,
  type CaretPosition,
  type HorizontalPaddingInput,
  type LastKeyEvent,
  type TextRow,
} from './inkTextArea/layout.js';
import type { SlashCommandDefinition, SlashCommandSourceItem } from './inkTextArea/commands.js';
import { useCommandMenu } from './inkTextArea/useCommandMenu.js';
import type { CommandMatch } from './inkTextArea/useCommandMenu.js';
import type { SlashCommandSelectEvent } from './inkTextArea/types.js';

const ANSI_INVERSE_ON = '\u001B[7m';
const ANSI_INVERSE_OFF = '\u001B[27m';

type LegacySlashMenuItem = SlashCommandSourceItem;

export interface InkTextAreaProps extends HorizontalPaddingInput {
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
  textProps?: Record<string, unknown>;
  debug?: boolean;
  showDebugMetrics?: boolean;
  commandMenuTitle?: string;
  [key: string]: unknown;
}

interface CommandMenuProps {
  matches: CommandMatch[];
  activeMatch: CommandMatch | null;
  isVisible: boolean;
  title?: string;
}

function CommandMenu({ matches, activeMatch, isVisible, title }: CommandMenuProps) {
  if (!isVisible || matches.length === 0) {
    return null;
  }

  const items = matches.map(({ item, index }) => ({ item, index }));

  return (
    <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="cyan">
      {title ? (
        <Text color="cyanBright" bold marginBottom={1}>
          {title}
        </Text>
      ) : null}
      {items.map(({ item, index }) => {
        const isActive = activeMatch?.index === index;
        const label = isActive ? `${ANSI_INVERSE_ON}${item.label}${ANSI_INVERSE_OFF}` : item.label;

        return (
          <Box
            key={String(item.id ?? index)}
            flexDirection="column"
            marginBottom={1}
            width="100%"
          >
            <Text color={isActive ? 'white' : 'cyan'}>{label}</Text>
            {item.description ? (
              <Text color="gray" dimColor>
                {item.description}
              </Text>
            ) : null}
          </Box>
        );
      })}
    </Box>
  );
}

export function InkTextArea(props: InkTextAreaProps) {
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
    textProps: explicitTextProps = {},
    debug = false,
    showDebugMetrics = false,
    commandMenuTitle,
    ...rest
  } = props;

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
    ...textPropsFromRest
  } = rest as Record<string, unknown>;

  const textProps = {
    ...textPropsFromRest,
    ...explicitTextProps,
  } as Record<string, unknown>;

  const interactive = isActive && !isDisabled;
  const [caretIndex, setCaretIndex] = useState(() => clamp(0, 0, value.length));
  const [showCaret, setShowCaret] = useState(true);
  const [lastKeyEvent, setLastKeyEvent] = useState<LastKeyEvent>(() => ({
    rawInput: '',
    printableInput: '',
    specialKeys: [],
    shiftModifierActive: false,
  }));
  const lastKeyEventRef = useRef({
    printableInput: '',
    wasReturnKey: false,
    shiftModifierActive: false,
  });
  const desiredColumnRef = useRef<number | null>(null);

  const { stdout } = useStdout();
  const [measuredWidth, setMeasuredWidth] = useState<number | undefined>(() =>
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

  useEffect(() => {
    if (!interactive) {
      setShowCaret(false);
      return undefined;
    }

    setShowCaret(true);
    const interval = setInterval(() => {
      setShowCaret((previous) => !previous);
    }, BLINK_INTERVAL_MS);

    return () => {
      clearInterval(interval);
    };
  }, [interactive]);

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

  const handleInput = useCallback(
    (input: string, key: Key) => {
      if (!interactive) {
        return;
      }

      const printableInput = input && input !== '\u0000' ? input : '';
      const specialKeys = extractSpecialKeys(key);
      const shiftModifierActive = Boolean(
        key?.shift || key?.isShiftPressed || specialKeys.includes('shift'),
      );
      const isLineFeedInput = printableInput === '\n';
      const isCarriageReturnInput = printableInput === '\r';
      const isShiftOnlySequence =
        shiftModifierActive &&
        !key?.return &&
        printableInput.length === 0 &&
        !key?.tab &&
        !key?.escape &&
        !key?.upArrow &&
        !key?.downArrow &&
        !key?.leftArrow &&
        !key?.rightArrow &&
        !key?.pageUp &&
        !key?.pageDown &&
        !key?.delete &&
        !key?.backspace;
      const previousKeyEvent = lastKeyEventRef.current;

      const isShiftEnter =
        isLineFeedInput ||
        (key?.return && shiftModifierActive) ||
        (isCarriageReturnInput && shiftModifierActive) ||
        isShiftOnlySequence;

      const isPlainReturnFollowedByLineFeed =
        isLineFeedInput &&
        !shiftModifierActive &&
        !key?.return &&
        previousKeyEvent?.wasReturnKey &&
        !previousKeyEvent.shiftModifierActive;

      const shouldInsertNewline = isShiftEnter && !isPlainReturnFollowedByLineFeed;

      lastKeyEventRef.current = {
        printableInput,
        wasReturnKey: Boolean(key?.return),
        shiftModifierActive,
      };

      setLastKeyEvent({
        rawInput: input,
        printableInput,
        specialKeys,
        shiftModifierActive,
      });

      const commandNavigationHandled = handleCommandNavigation(key, shouldInsertNewline);

      if (commandNavigationHandled) {
        return;
      }

      if (key.ctrl || key.meta) {
        return;
      }

      if (key.return && !shouldInsertNewline) {
        onSubmit?.(value);
        return;
      }

      if (shouldInsertNewline) {
        const nextValue = `${value.slice(0, caretIndex)}\n${value.slice(caretIndex)}`;
        updateValue(nextValue, caretIndex + 1);
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
        setCaretIndex((previous) => Math.max(0, previous - 1));
        return;
      }

      if (key.rightArrow) {
        setCaretIndex((previous) => Math.min(value.length, previous + 1));
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
      handleCommandNavigation,
      interactive,
      onSubmit,
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
  }, [hasValue, normalizedWidth, placeholder, resolvedPaddingLeft, resolvedPaddingRight, rows]);

  const computedTextProps = useMemo(() => {
    const { dimColor, wrap, ...otherTextProps } = textProps;

    return {
      wrap: wrap ?? 'wrap',
      dimColor: dimColor ?? !hasValue,
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
        <Box key={key} flexDirection="row" width="100%" alignSelf="stretch">
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
        <Box key={key} flexDirection="row" width="100%" alignSelf="stretch">
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
      <Box key={key} flexDirection="row" width="100%" alignSelf="stretch">
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

  const containerStyle: Record<string, unknown> = {
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
      containerStyle[key] = value;
    }
  }

  return (
    <Box {...containerStyle}>
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
