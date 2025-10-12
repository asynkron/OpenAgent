import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import type { BoxProps, Key, TextProps } from 'ink';

type MaybePromise<T> = T | Promise<T>;

type SlashCommandItem = {
  id?: string | number;
  label?: unknown;
  title?: unknown;
  name?: unknown;
  key?: unknown;
  description?: unknown;
  keywords?: unknown;
  insertValue?: unknown;
  replacement?: unknown;
  [key: string]: unknown;
};

type NormalizedSlashCommandItem = {
  id: string | number;
  label: string;
  description?: string;
  keywords: string[];
  insertValue?: string;
  source: SlashCommandItem;
};

type SlashCommandFilterContext = {
  query: string;
  normalizedQuery: string;
  command: SlashCommandDefinition;
  value: string;
  caretIndex: number;
};

type SlashCommandActivationContext = {
  value: string;
  caretIndex: number;
  triggerIndex: number;
  query: string;
  precedingChar: string;
  command: SlashCommandDefinition;
};

type SlashCommandRange = {
  startIndex: number;
  endIndex: number;
};

type SlashCommandGetItemsContext = {
  query: string;
  command: SlashCommandDefinition;
  value: string;
  caretIndex: number;
  range: SlashCommandRange;
};

type SlashCommandDefinition = {
  id?: string;
  trigger?: string;
  allowNewlines?: boolean;
  allowInline?: boolean;
  items?: SlashCommandItem[];
  getItems?: (context: SlashCommandGetItemsContext) => MaybePromise<SlashCommandItem[] | null | undefined>;
  filterItem?: (
    item: NormalizedSlashCommandItem,
    context: SlashCommandFilterContext,
  ) => boolean;
  shouldActivate?: (context: SlashCommandActivationContext) => boolean;
};

type NormalizedSlashCommandDefinition = {
  id: string;
  trigger: string;
  triggerLength: number;
  allowNewlines: boolean;
  allowInline: boolean;
  shouldActivate: (context: SlashCommandActivationContext) => boolean;
  filterItem: (item: NormalizedSlashCommandItem, context: SlashCommandFilterContext) => boolean;
  getItems: ((context: SlashCommandGetItemsContext) => MaybePromise<SlashCommandItem[] | null | undefined>) | null;
  staticItems: NormalizedSlashCommandItem[];
  order: number;
  source: SlashCommandDefinition;
};

type ActiveCommandMatch = {
  command: NormalizedSlashCommandDefinition;
  startIndex: number;
  endIndex: number;
  query: string;
};

type CommandMatch = {
  item: NormalizedSlashCommandItem;
  index: number;
};

type SlashCommandSelection = {
  item: SlashCommandItem;
  query: string;
  command: SlashCommandDefinition;
  range: SlashCommandRange;
  replacement: string;
  value: string;
};

type LastKeyEvent = {
  rawInput: string;
  printableInput: string;
  specialKeys: string[];
  shiftModifierActive: boolean;
};

type KeyEventState = {
  printableInput: string;
  wasReturnKey: boolean;
  shiftModifierActive: boolean;
};

type TextRow = {
  text: string;
  startIndex: number;
};

type CaretPosition = {
  rowIndex: number;
  column: number;
  row: TextRow;
};

type HorizontalPaddingOptions = Pick<
  BoxProps,
  'padding' | 'paddingX' | 'paddingLeft' | 'paddingRight'
>;

type TransformToRowsOptions = Pick<BoxProps, 'paddingLeft' | 'paddingRight'>;

type ExtendedKey = Key & {
  isShiftPressed?: boolean;
  code?: string;
  home?: boolean;
  end?: boolean;
  [key: string]: unknown;
};

type InkTextAreaProps = Omit<BoxProps, 'children'> &
  Omit<TextProps, 'children'> & {
    value?: string;
    onChange?: (value: string) => void;
    onSubmit?: (value: string) => void;
    placeholder?: string;
    width?: number;
    isActive?: boolean;
    isDisabled?: boolean;
    slashMenuItems?: SlashCommandItem[];
    commandMenus?: SlashCommandDefinition[];
    onSlashCommandSelect?: (selection: SlashCommandSelection) => void;
  };

const h = React.createElement;
const BLINK_INTERVAL_MS = 500;

function isWhitespace(char: string | undefined): boolean {
  if (!char) {
    return false;
  }
  return /\s/u.test(char);
}

function normalizeSlashItem(
  item: SlashCommandItem | null | undefined,
  index: number,
): NormalizedSlashCommandItem | null {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const labelSource =
    item.label ?? item.title ?? item.name ?? item.id ?? item.key ?? `item-${index}`;
  const label = typeof labelSource === 'string' ? labelSource : String(labelSource);
  const description =
    typeof item.description === 'string' && item.description.length > 0
      ? item.description
      : undefined;
  const keywords = Array.isArray(item.keywords)
    ? item.keywords.filter((keyword): keyword is string => typeof keyword === 'string')
    : [];
  const insertValue =
    typeof item.insertValue === 'string'
      ? item.insertValue
      : typeof item.replacement === 'string'
        ? item.replacement
        : undefined;

  return {
    id: item.id ?? index,
    label,
    description,
    keywords,
    insertValue,
    source: item,
  };
}

function defaultFilterItem(
  item: NormalizedSlashCommandItem,
  context: SlashCommandFilterContext | null,
): boolean {
  if (!context) {
    return true;
  }

  const { normalizedQuery } = context;

  if (!normalizedQuery) {
    return true;
  }

  const tokens = normalizedQuery
    .split(/\s+/u)
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    return true;
  }

  const normalizedDescription =
    typeof item.description === 'string' ? item.description.replace(/\([^)]*\)/gu, ' ') : '';

  const haystackParts = [
    item.label,
    item.insertValue,
    normalizedDescription,
    ...(item.keywords ?? []),
  ]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .map((part) => part.toLowerCase());

  if (haystackParts.length === 0) {
    return false;
  }

  if (tokens.length > 1) {
    const contiguousQuery = normalizedQuery.trim().replace(/\s+/gu, ' ');

    if (contiguousQuery.length > 0) {
      const hasContiguousMatch = haystackParts.some((part) => part.includes(contiguousQuery));

      if (!hasContiguousMatch) {
        return false;
      }
    }
  }

  // Ensure every token from the query appears in at least one searchable field so
  // long example strings (e.g., descriptions) do not cause overly broad matches.
  return tokens.every((token) => haystackParts.some((part) => part.includes(token)));
}

function normalizeCommandDefinition(
  definition: SlashCommandDefinition | null | undefined,
  index: number,
): NormalizedSlashCommandDefinition | null {
  if (!definition || typeof definition !== 'object') {
    return null;
  }

  const trigger =
    typeof definition.trigger === 'string' && definition.trigger.length > 0
      ? definition.trigger
      : '/';

  const allowInline = Boolean(definition.allowInline);
  const shouldActivate =
    typeof definition.shouldActivate === 'function'
      ? definition.shouldActivate
      : ({ precedingChar }: SlashCommandActivationContext) =>
          allowInline || !precedingChar || isWhitespace(precedingChar);

  const filterItem =
    typeof definition.filterItem === 'function' ? definition.filterItem : defaultFilterItem;

  const staticItems = Array.isArray(definition.items)
    ? definition.items
        .map((item, itemIndex) => normalizeSlashItem(item, itemIndex))
        .filter((value): value is NormalizedSlashCommandItem => Boolean(value))
    : [];

  const getItems = typeof definition.getItems === 'function' ? definition.getItems : null;
  const allowNewlines = Boolean(definition.allowNewlines);

  return {
    id: definition.id ?? `command-${index}`,
    trigger,
    triggerLength: trigger.length,
    allowNewlines,
    allowInline,
    shouldActivate,
    filterItem,
    getItems,
    staticItems,
    order: index,
    source: definition,
  };
}

function computeActiveCommand(
  value: string,
  caretIndex: number,
  commands: NormalizedSlashCommandDefinition[],
): ActiveCommandMatch | null {
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }

  if (!Array.isArray(commands) || commands.length === 0) {
    return null;
  }

  const clampedIndex = clamp(caretIndex ?? value.length, 0, value.length);
  const textToCaret = value.slice(0, clampedIndex);
  let bestMatch: ActiveCommandMatch | null = null;

  for (const command of commands) {
    const triggerIndex = textToCaret.lastIndexOf(command.trigger);

    if (triggerIndex === -1) {
      continue;
    }

    const queryStart = triggerIndex + command.triggerLength;

    if (queryStart > clampedIndex) {
      continue;
    }

    const query = textToCaret.slice(queryStart);

    if (!command.allowNewlines && query.includes('\n')) {
      continue;
    }

    if (query.includes('\u0000')) {
      continue;
    }

    const precedingChar = triggerIndex > 0 ? textToCaret[triggerIndex - 1] : '';

    const context = {
      value,
      caretIndex: clampedIndex,
      triggerIndex,
      query,
      precedingChar,
      command: command.source ?? command,
    };

    if (!command.shouldActivate(context)) {
      continue;
    }

    if (
      !bestMatch ||
      triggerIndex > bestMatch.startIndex ||
      (triggerIndex === bestMatch.startIndex && command.order > bestMatch.command.order)
    ) {
      bestMatch = {
        command,
        startIndex: triggerIndex,
        endIndex: clampedIndex,
        query,
      };
    }
  }

  return bestMatch;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

const ARROW_LABELS: Record<string, string> = {
  upArrow: 'up',
  downArrow: 'down',
  leftArrow: 'left',
  rightArrow: 'right',
};

function toNonNegativeInteger(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}

function resolveHorizontalPadding({
  padding,
  paddingX,
  paddingLeft,
  paddingRight,
}: HorizontalPaddingOptions): {
  paddingLeft: number;
  paddingRight: number;
} {
  const base = toNonNegativeInteger(padding);
  const horizontal = paddingX !== undefined ? toNonNegativeInteger(paddingX) : base;
  const left = paddingLeft !== undefined ? toNonNegativeInteger(paddingLeft) : horizontal;
  const right = paddingRight !== undefined ? toNonNegativeInteger(paddingRight) : horizontal;
  return { paddingLeft: left, paddingRight: right };
}

function extractSpecialKeys(key: ExtendedKey | undefined): string[] {
  if (!key || typeof key !== 'object') {
    return [];
  }

  return Object.entries(key)
    .filter(([name, value]) => {
      return typeof value === 'boolean' && value && name !== 'isShiftPressed';
    })
    .map(([name]) => ARROW_LABELS[name] ?? name);
}

/**
 * Break a string into the visual rows rendered by the editor.
 * Rows end either because the terminal width was reached or a newline was encountered.
 */
export function transformToRows(
  source: string,
  maxWidth: number,
  options: TransformToRowsOptions = {},
): TextRow[] {
  const { paddingLeft = 0, paddingRight = 0 } = options ?? {};
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
      rows.push({
        text,
        startIndex: rowStartIndex,
      });
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

function computeCaretPosition(rows: TextRow[], caretIndex: number, totalLength: number): CaretPosition {
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
  slashMenuItems = [],
  commandMenus = [],
  onSlashCommandSelect,
  ...rest
}: InkTextAreaProps): React.ReactElement {
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
    ...textPropsRest
  } = rest;
  const textProps: Partial<TextProps> = textPropsRest;
  const [caretIndex, setCaretIndex] = useState<number>(() => clamp(0, 0, value.length));
  const [showCaret, setShowCaret] = useState<boolean>(true);
  const [lastKeyEvent, setLastKeyEvent] = useState<LastKeyEvent>(() => ({
    rawInput: '',
    printableInput: '',
    specialKeys: [],
    shiftModifierActive: false,
  }));
  const lastKeyEventRef = useRef<KeyEventState>({
    printableInput: '',
    wasReturnKey: false,
    shiftModifierActive: false,
  });
  const desiredColumnRef = useRef<number | null>(null);
  const [commandHighlightIndex, setCommandHighlightIndex] = useState(0);
  const interactive = isActive && !isDisabled;

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
    setCaretIndex((prev) => clamp(prev, 0, maxIndex));
  }, [maxIndex]);

  const { paddingLeft: resolvedPaddingLeft, paddingRight: resolvedPaddingRight } = useMemo(
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

  const [dynamicCommandItems, setDynamicCommandItems] = useState<
    Record<string, { signature: string; items: NormalizedSlashCommandItem[] }>
  >(() => ({}));

  const normalizedCommands = useMemo(() => {
    const legacyDefinitions =
      Array.isArray(slashMenuItems) && slashMenuItems.length > 0
        ? [
            {
              id: 'legacy-slash-command',
              trigger: '/',
              items: slashMenuItems,
            },
          ]
        : [];

    const providedDefinitions = Array.isArray(commandMenus) ? commandMenus : [];

    return [...legacyDefinitions, ...providedDefinitions]
      .map((definition, index) => normalizeCommandDefinition(definition, index))
      .filter((definition): definition is NormalizedSlashCommandDefinition => Boolean(definition));
  }, [commandMenus, slashMenuItems]);

  const activeCommand = useMemo(
    () => computeActiveCommand(value, caretIndex, normalizedCommands),
    [caretIndex, normalizedCommands, value],
  );

  const activeCommandId = activeCommand?.command?.id;

  useEffect(() => {
    // Fetch dynamic command items whenever the active command relies on a callback.
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
          .filter((value): value is NormalizedSlashCommandItem => Boolean(value));

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

  const commandMatches = useMemo<CommandMatch[]>(() => {
    if (!activeCommand) {
      return [];
    }

    const { command } = activeCommand;
    const asyncItems = dynamicCommandItems[command.id]?.items ?? [];
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
  }, [activeCommand, caretIndex, dynamicCommandItems, value]);

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

    if (!activeCommand) {
      return;
    }

    const signature = `${activeCommand.startIndex}:${activeCommand.query}:${activeCommandId}`;
    if (commandSignatureRef.current !== signature) {
      commandSignatureRef.current = signature;
      setCommandHighlightIndex(0);
      return;
    }

    setCommandHighlightIndex((prev) => clamp(prev, 0, commandMatches.length - 1));
  }, [
    activeCommand?.query,
    activeCommand?.startIndex,
    activeCommandId,
    commandHighlightIndex,
    commandMatches.length,
    commandMenuVisible,
  ]);

  const resolvedCommandHighlightIndex = commandMenuVisible
    ? Math.min(commandHighlightIndex, commandMatches.length - 1)
    : 0;

  const selectedCommandMatch = commandMenuVisible
    ? (commandMatches[resolvedCommandHighlightIndex] ?? commandMatches[0])
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
      setShowCaret((prev) => !prev);
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

  const handleCommandSelection = useCallback((): boolean => {
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
    onSlashCommandSelect?.({
      item: item.source ?? item,
      query: activeCommand.query,
      command: activeCommand.command.source ?? activeCommand.command,
      range: {
        startIndex: activeCommand.startIndex,
        endIndex: activeCommand.endIndex,
      },
      replacement,
      value: nextValue,
    });

    setCommandHighlightIndex(0);
    return true;
  }, [
    activeCommand,
    onSlashCommandSelect,
    selectedCommandMatch,
    commandMenuVisible,
    updateValue,
    value,
  ]);

  const handleInput = useCallback(
    (input: string, key: ExtendedKey) => {
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

      const commandNavigationHandled = (() => {
        if (!commandMenuVisible) {
          return false;
        }

        const total = commandMatches.length;

        if (total === 0) {
          return false;
        }

        if (key.upArrow || (key.tab && key.shift)) {
          setCommandHighlightIndex((prev) => {
            const next = (prev - 1 + total) % total;
            return next;
          });
          return true;
        }

        if (key.downArrow || (key.tab && !key.shift)) {
          setCommandHighlightIndex((prev) => {
            const next = (prev + 1) % total;
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
        // Shift+Enter (or a raw newline input) inserts a line break at the caret instead of submitting.
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
      handleCommandSelection,
      interactive,
      onSubmit,
      rows,
      commandMatches.length,
      commandMenuVisible,
      updateValue,
      value,
    ],
  );

  useInput(handleInput, { isActive: interactive });

  const caretVisible = interactive && showCaret;
  const hasValue = value.length > 0;
  const displayRows = useMemo<TextRow[]>(() => {
    if (hasValue) {
      return rows;
    }
    return transformToRows(placeholder, normalizedWidth, {
      paddingLeft: resolvedPaddingLeft,
      paddingRight: resolvedPaddingRight,
    });
  }, [hasValue, normalizedWidth, placeholder, resolvedPaddingLeft, resolvedPaddingRight, rows]);

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
      const placeholderSegments: Array<string | React.ReactElement> = [
        h(Text, { inverse: true, key: 'caret-highlight' }, ' '),
      ];
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
    const segments: Array<string | React.ReactElement> = [];

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

  const commandMenuElement = useMemo<React.ReactNode>(() => {
    if (!commandMenuVisible) {
      return null;
    }

    return h(
      Box,
      {
        key: 'command-menu',
        flexDirection: 'column',
        borderStyle: 'round',
        borderColor: 'cyan',
        marginTop: 1,
        width: '100%',
      },
      ...commandMatches.map((match, index) => {
        const isSelected = index === resolvedCommandHighlightIndex;
        const labelContent = isSelected
          ? `${ANSI_INVERSE_ON}${match.item.label}${ANSI_INVERSE_OFF}`
          : match.item.label;
        const segments = [
          h(
            Text,
            {
              key: 'label',
            },
            labelContent,
          ),
        ];

        if (match.item.description) {
          segments.push(
            h(
              Text,
              {
                key: 'spacer',
              },
              ' ',
            ),
          );
          segments.push(
            h(
              Text,
              {
                key: 'description',
                color: isSelected ? undefined : 'gray',
                dimColor: !isSelected,
              },
              match.item.description,
            ),
          );
        }

        return h(
          Box,
          {
            key: `command-item-${match.item.id ?? index}`,
            paddingX: 1,
          },
          ...segments,
        );
      }),
    );
  }, [commandMatches, commandMenuVisible, resolvedCommandHighlightIndex]);

  const shouldRenderDebug = process.env.NODE_ENV === 'test';

  const debugElement = useMemo<React.ReactNode>(() => {
    if (!shouldRenderDebug) {
      return null;
    }

    return h(
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
    );
  }, [
    caretColumnDisplay,
    caretIndex,
    caretLineDisplay,
    effectiveWidth,
    lastKeyDisplay,
    measuredWidthDisplay,
    modifierKeys,
    normalizedWidth,
    shouldRenderDebug,
    widthPropDisplay,
  ]);

  const containerProps = useMemo<BoxProps>(() => {
    const baseStyle = {
      flexDirection: 'column' as const,
      width: '100%' as const,
      alignSelf: 'stretch' as unknown as BoxProps['alignSelf'],
    };

    return {
      ...baseStyle,
      ...(padding !== undefined ? { padding } : {}),
      ...(paddingX !== undefined ? { paddingX } : {}),
      ...(paddingY !== undefined ? { paddingY } : {}),
      ...(paddingLeft !== undefined ? { paddingLeft } : {}),
      ...(paddingRight !== undefined ? { paddingRight } : {}),
      ...(paddingTop !== undefined ? { paddingTop } : {}),
      ...(paddingBottom !== undefined ? { paddingBottom } : {}),
      ...(margin !== undefined ? { margin } : {}),
      ...(marginX !== undefined ? { marginX } : {}),
      ...(marginY !== undefined ? { marginY } : {}),
      ...(marginLeft !== undefined ? { marginLeft } : {}),
      ...(marginRight !== undefined ? { marginRight } : {}),
      ...(marginTop !== undefined ? { marginTop } : {}),
      ...(marginBottom !== undefined ? { marginBottom } : {}),
      ...(borderColor !== undefined ? { borderColor } : {}),
      ...(borderStyle !== undefined ? { borderStyle } : {}),
      ...(borderTop !== undefined ? { borderTop } : {}),
      ...(borderBottom !== undefined ? { borderBottom } : {}),
      ...(borderLeft !== undefined ? { borderLeft } : {}),
      ...(borderRight !== undefined ? { borderRight } : {}),
    } satisfies BoxProps;
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
    commandMenuElement,
    debugElement,
    // h(
    //   Box,
    //   { flexDirection: 'column', marginTop: 1 },
    //   h(Text, { color: 'gray', dimColor: true, key: 'debug-heading' }, 'Debug info'),
    //   h(
    //     Text,
    //     { color: 'gray', key: 'debug-width' },
    //     `Width: ${normalizedWidth} (effective: ${effectiveWidth}, prop: ${widthPropDisplay}, measured: ${measuredWidthDisplay})`,
    //   ),
    //   h(
    //     Text,
    //     { color: 'gray', key: 'debug-caret' },
    //     `Caret: line ${caretLineDisplay}, column ${caretColumnDisplay}, index ${caretIndex}`,
    //   ),
    //   h(Text, { color: 'gray', key: 'debug-last-key' }, `Last key: ${lastKeyDisplay}`),
    //   h(
    //     Text,
    //     { color: 'gray', key: 'debug-modifiers' },
    //     `Special keys: ${modifierKeys.length > 0 ? modifierKeys.join(', ') : 'none'}`,
    //   ),
    // ),
  );
}

export default InkTextArea;
const ANSI_INVERSE_ON = '\u001B[7m';
const ANSI_INVERSE_OFF = '\u001B[27m';
