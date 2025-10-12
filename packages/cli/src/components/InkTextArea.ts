// @ts-nocheck
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import {
  buildSlashCommandEvent,
  computeActiveCommand,
  normalizeCommandDefinition,
  normalizeSlashItem,
  type ActiveSlashCommand,
  type NormalizedSlashCommand,
  type SlashCommandDefinition,
  type SlashCommandItem,
  type SlashCommandSourceItem,
} from './inkTextArea/commands.js';
import type { SlashCommandSelectEvent } from './inkTextArea/types.js';

const h = React.createElement;

const ANSI_INVERSE_ON = '\u001B[7m';
const ANSI_INVERSE_OFF = '\u001B[27m';

type LegacySlashMenuItem = SlashCommandSourceItem;

interface CommandMatch {
  item: SlashCommandItem;
  index: number;
}

interface CommandCacheEntry {
  signature: string;
  items: SlashCommandItem[];
}

type CommandCache = Record<string, CommandCacheEntry>;

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

export function buildCommandDefinitions(
  slashMenuItems: ReadonlyArray<LegacySlashMenuItem> | undefined,
  commandMenus: ReadonlyArray<SlashCommandDefinition> | undefined,
): NormalizedSlashCommand[] {
  const legacyDefinitions: SlashCommandDefinition[] =
    Array.isArray(slashMenuItems) && slashMenuItems.length > 0
      ? [
          {
            id: 'legacy-slash-command',
            trigger: '/',
            items: slashMenuItems as SlashCommandSourceItem[],
          },
        ]
      : [];

  const providedDefinitions = Array.isArray(commandMenus) ? commandMenus : [];

  return [...legacyDefinitions, ...providedDefinitions]
    .map((definition, index) => normalizeCommandDefinition(definition, index))
    .filter((definition): definition is NormalizedSlashCommand => Boolean(definition));
}

function useCommandItems(
  activeCommand: ActiveSlashCommand | null,
  caretIndex: number,
  value: string,
): CommandCache {
  const [dynamicCommandItems, setDynamicCommandItems] = useState<CommandCache>({});

  useEffect(() => {
    if (!activeCommand) {
      return undefined;
    }

    const { command } = activeCommand;

    if (!command.getItems) {
      return undefined;
    }

    let cancelled = false;
    const signature = `${command.id}:${activeCommand.startIndex}:${activeCommand.query}`;

    Promise.resolve(
      command.getItems({
        query: activeCommand.query,
        command: command.source ?? command,
        value,
        caretIndex,
        range: { startIndex: activeCommand.startIndex, endIndex: activeCommand.endIndex },
      }),
    )
      .then((items) => (Array.isArray(items) ? items : []))
      .catch(() => [])
      .then((items) => {
        if (cancelled) {
          return;
        }

        const normalizedItems = items
          .map((item, index) => normalizeSlashItem(item, index))
          .filter((value): value is SlashCommandItem => Boolean(value));

        setDynamicCommandItems((prev) => {
          const previousEntry = prev[command.id];

          if (previousEntry && previousEntry.signature === signature) {
            return prev;
          }

          return {
            ...prev,
            [command.id]: {
              signature,
              items: normalizedItems,
            },
          };
        });
      });

    return () => {
      cancelled = true;
    };
  }, [activeCommand, caretIndex, value]);

  return dynamicCommandItems;
}

function buildCommandMatches(
  activeCommand: ActiveSlashCommand | null,
  dynamicItems: CommandCache,
  caretIndex: number,
  value: string,
): CommandMatch[] {
  if (!activeCommand) {
    return [];
  }

  const { command } = activeCommand;
  const asyncItems = dynamicItems[command.id]?.items ?? [];
  const allItems = [...command.staticItems, ...asyncItems];
  const normalizedQuery = activeCommand.query.toLowerCase();

  return allItems
    .map((item, index) => ({ item, index }))
    .filter(({ item }) =>
      command.filterItem(item, {
        query: activeCommand.query,
        normalizedQuery,
        command: command.source ?? command,
        value,
        caretIndex: activeCommand.endIndex,
      }),
    );
}

function CommandMenu({ matches, activeMatch, isVisible, title }: CommandMenuProps) {
  if (!isVisible || matches.length === 0) {
    return null;
  }

  const items = matches.map(({ item, index }) => ({ item, index }));

  return h(
    Box,
    { flexDirection: 'column', marginTop: 1, borderStyle: 'round', borderColor: 'cyan' },
    title
      ? h(Text, { key: 'title', color: 'cyanBright', bold: true, marginBottom: 1 }, title)
      : null,
    ...items.map(({ item, index }) => {
      const isActive = activeMatch?.index === index;
      const label = isActive ? `${ANSI_INVERSE_ON}${item.label}${ANSI_INVERSE_OFF}` : item.label;

      return h(
        Box,
        {
          key: String(item.id ?? index),
          flexDirection: 'column',
          marginBottom: 1,
          width: '100%',
        },
        h(Text, { color: isActive ? 'white' : 'cyan' }, label),
        item.description
          ? h(Text, { color: 'gray', dimColor: true }, item.description)
          : null,
      );
    }),
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
  const [commandHighlightIndex, setCommandHighlightIndex] = useState(0);

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

  const normalizedCommands = useMemo(
    () => buildCommandDefinitions(slashMenuItems, commandMenus),
    [commandMenus, slashMenuItems],
  );

  const activeCommand = useMemo<ActiveSlashCommand | null>(
    () => computeActiveCommand(value, caretIndex, normalizedCommands),
    [caretIndex, normalizedCommands, value],
  );

  const dynamicCommandItems = useCommandItems(activeCommand, caretIndex, value);
  const commandMatches = useMemo(
    () => buildCommandMatches(activeCommand, dynamicCommandItems, caretIndex, value),
    [activeCommand, caretIndex, dynamicCommandItems, value],
  );

  const commandMenuVisible = Boolean(activeCommand) && commandMatches.length > 0;
  const commandSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    if (!commandMenuVisible) {
      commandSignatureRef.current = null;
      if (commandHighlightIndex !== 0) {
        setCommandHighlightIndex(0);
      }
      return;
    }

    const signature = `${activeCommand?.startIndex ?? 0}:${activeCommand?.query ?? ''}:${activeCommand?.command.id ?? ''}`;
    if (commandSignatureRef.current !== signature) {
      commandSignatureRef.current = signature;
      setCommandHighlightIndex(0);
      return;
    }

    setCommandHighlightIndex((previous) => clamp(previous, 0, commandMatches.length - 1));
  }, [
    activeCommand?.query,
    activeCommand?.startIndex,
    activeCommand?.command.id,
    commandHighlightIndex,
    commandMatches.length,
    commandMenuVisible,
  ]);

  const resolvedCommandHighlightIndex = commandMenuVisible
    ? Math.min(commandHighlightIndex, commandMatches.length - 1)
    : 0;

  const selectedCommandMatch = commandMenuVisible
    ? commandMatches[resolvedCommandHighlightIndex] ?? commandMatches[0]
    : null;

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

  const handleCommandSelection = useCallback(() => {
    if (!commandMenuVisible || !selectedCommandMatch || !activeCommand) {
      return false;
    }

    const { item } = selectedCommandMatch;
    const replacement = item.insertValue ?? '';
    const before = value.slice(0, activeCommand.startIndex);
    const after = value.slice(activeCommand.endIndex);
    const nextValue = `${before}${replacement}${after}`;
    const nextCaretIndex = before.length + replacement.length;

    updateValue(nextValue, nextCaretIndex);
    onSlashCommandSelect?.(buildSlashCommandEvent(activeCommand, item, replacement, nextValue));

    setCommandHighlightIndex(0);
    return true;
  }, [activeCommand, commandMenuVisible, onSlashCommandSelect, selectedCommandMatch, updateValue, value]);

  const handleInput = useCallback(
    (input: string, key: Key) => {
      if (!interactive) {
        return;
      }

      const printableInput = input && input !== '\u0000' ? input : '';
      const specialKeys = extractSpecialKeys(key);
      const shiftModifierActive = Boolean(key?.shift || key?.isShiftPressed || specialKeys.includes('shift'));
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

      const commandNavigationHandled = (() => {
        if (!commandMenuVisible) {
          return false;
        }

        const total = commandMatches.length;

        if (total === 0) {
          return false;
        }

        if (key.upArrow || (key.tab && key.shift)) {
          setCommandHighlightIndex((previous) => {
            const next = (previous - 1 + total) % total;
            return next;
          });
          return true;
        }

        if (key.downArrow || (key.tab && !key.shift)) {
          setCommandHighlightIndex((previous) => {
            const next = (previous + 1) % total;
            return next;
          });
          return true;
        }

        if (key.return && !shouldInsertNewline) {
          return handleCommandSelection();
        }

        return false;
      })();

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
      activeCommand,
      caretIndex,
      caretPosition,
      commandMatches,
      commandMenuVisible,
      handleCommandSelection,
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

    if (!isCaretRow) {
      const textContent = row.text.length > 0 ? row.text : ' ';
      return h(
        Box,
        {
          key: `row-${row.startIndex}-${index}`,
          flexDirection: 'row',
          width: '100%',
          alignSelf: 'stretch',
        },
        h(Text, { key: 'row', ...computedTextProps }, textContent),
      );
    }

    if (!hasValue) {
      const segments = [
        h(Text, { key: 'caret', inverse: caretVisible, ...computedTextProps }, ' '),
      ];

      if (row.text.length > 0) {
        segments.push(h(Text, { key: 'placeholder', ...computedTextProps }, row.text));
      }

      return h(
        Box,
        {
          key: `row-${row.startIndex}-${index}`,
          flexDirection: 'row',
          width: '100%',
          alignSelf: 'stretch',
        },
        ...segments,
      );
    }

    const beforeCaret = row.text.slice(0, caretColumn);
    const caretChar = row.text[caretColumn];
    const caretDisplay = caretChar ?? ' ';
    const afterStart = caretChar ? caretColumn + 1 : caretColumn;
    const afterCaret = row.text.slice(afterStart);
    const segments = [] as React.ReactNode[];

    if (beforeCaret.length > 0) {
      segments.push(h(Text, { key: 'before', ...computedTextProps }, beforeCaret));
    }

    segments.push(
      h(Text, { key: 'caret', inverse: caretVisible, ...computedTextProps }, caretDisplay),
    );

    if (afterCaret.length > 0) {
      segments.push(h(Text, { key: 'after', ...computedTextProps }, afterCaret));
    }

    if (segments.length === 1 && caretDisplay === ' ') {
      segments.push(h(Text, { key: 'padding', ...computedTextProps }, ''));
    }

    return h(
      Box,
      {
        key: `row-${row.startIndex}-${index}`,
        flexDirection: 'row',
        width: '100%',
        alignSelf: 'stretch',
      },
      ...segments,
    );
  });

  const resolvedCommandHighlight = commandMenuVisible
    ? commandMatches[Math.min(commandHighlightIndex, commandMatches.length - 1)] ?? null
    : null;

  const commandMenuElement = h(CommandMenu, {
    matches: commandMatches,
    activeMatch: resolvedCommandHighlight,
    isVisible: commandMenuVisible,
    title: commandMenuTitle,
  });

  const shouldRenderDebug = debug || showDebugMetrics || process.env.NODE_ENV === 'test';
  const modifierKeys = lastKeyEvent.specialKeys;
  const widthPropDisplay = typeof width === 'number' ? String(width) : 'auto';
  const measuredWidthDisplay = measuredWidth ? String(measuredWidth) : 'n/a';
  const lastKeyDisplay = lastKeyEvent.printableInput || lastKeyEvent.rawInput || 'none';

  const debugElement = shouldRenderDebug
    ? h(
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
      )
    : null;

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

  return h(
    Box,
    containerStyle,
    h(Box, { flexDirection: 'column', width: '100%' }, ...rowElements),
    commandMenuElement,
    debugElement,
  );
}

export { transformToRows } from './inkTextArea/layout.js';
export default InkTextArea;
