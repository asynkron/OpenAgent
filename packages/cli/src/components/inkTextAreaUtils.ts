import type { Key } from 'ink';

/** Utility type representing identifiers used by slash commands. */
export type SlashCommandIdentifier = string | number;

/**
 * Raw item definition that can be provided by slash command menus. Additional
 * fields are preserved on the `source` property when items are normalised.
 */
export interface SlashCommandItemSource {
  id?: SlashCommandIdentifier;
  label?: string;
  title?: string;
  name?: string;
  key?: string;
  description?: string;
  keywords?: ReadonlyArray<unknown> | null;
  insertValue?: string;
  replacement?: string;
  [key: string]: unknown;
}

/** Normalised slash command item used when rendering menu entries. */
export interface NormalizedSlashCommandItem {
  id: SlashCommandIdentifier;
  label: string;
  description?: string;
  keywords: string[];
  insertValue?: string;
  source: SlashCommandItemSource;
}

export interface SlashCommandActivationContext {
  value: string;
  caretIndex: number;
  triggerIndex: number;
  query: string;
  precedingChar: string;
  command: SlashCommandDefinition;
}

export interface SlashCommandFilterContext {
  query: string;
  normalizedQuery: string;
  command: SlashCommandDefinition;
  value: string;
  caretIndex: number;
}

export interface SlashCommandItemsContext {
  query: string;
  command: SlashCommandDefinition;
  value: string;
  caretIndex: number;
  range: {
    startIndex: number;
    endIndex: number;
  };
}

export type SlashCommandItemsResult =
  | ReadonlyArray<SlashCommandItemSource>
  | null
  | undefined;

export type MaybePromise<T> = T | PromiseLike<T>;

export interface SlashCommandDefinition {
  id?: SlashCommandIdentifier;
  trigger?: string;
  allowInline?: boolean;
  allowNewlines?: boolean;
  shouldActivate?: (context: SlashCommandActivationContext) => boolean;
  filterItem?: (
    item: NormalizedSlashCommandItem,
    context: SlashCommandFilterContext,
  ) => boolean;
  getItems?: (context: SlashCommandItemsContext) => MaybePromise<SlashCommandItemsResult>;
  items?: ReadonlyArray<SlashCommandItemSource> | null;
  [key: string]: unknown;
}

export interface NormalizedSlashCommand {
  id: SlashCommandIdentifier;
  trigger: string;
  triggerLength: number;
  allowNewlines: boolean;
  allowInline: boolean;
  shouldActivate: (context: SlashCommandActivationContext) => boolean;
  filterItem: (
    item: NormalizedSlashCommandItem,
    context: SlashCommandFilterContext,
  ) => boolean;
  getItems: ((context: SlashCommandItemsContext) => MaybePromise<SlashCommandItemsResult>) | null;
  staticItems: NormalizedSlashCommandItem[];
  order: number;
  source: SlashCommandDefinition;
}

export interface ActiveSlashCommand {
  command: NormalizedSlashCommand;
  startIndex: number;
  endIndex: number;
  query: string;
}

function isWhitespace(char: string | undefined | null): boolean {
  if (!char) {
    return false;
  }
  return /\s/u.test(char);
}

export function normalizeSlashItem(
  item: SlashCommandItemSource | null | undefined,
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
  context: SlashCommandFilterContext,
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

export function normalizeCommandDefinition(
  definition: SlashCommandDefinition | null | undefined,
  index: number,
): NormalizedSlashCommand | null {
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
        .filter((item): item is NormalizedSlashCommandItem => Boolean(item))
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

export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function computeActiveCommand(
  value: string,
  caretIndex: number | null | undefined,
  commands: ReadonlyArray<NormalizedSlashCommand> | null | undefined,
): ActiveSlashCommand | null {
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }

  if (!Array.isArray(commands) || commands.length === 0) {
    return null;
  }

  const clampedIndex = clamp(caretIndex ?? value.length, 0, value.length);
  const textToCaret = value.slice(0, clampedIndex);
  let bestMatch: ActiveSlashCommand | null = null;

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

    const precedingChar = triggerIndex > 0 ? textToCaret[triggerIndex - 1] ?? '' : '';

    const context: SlashCommandActivationContext = {
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

export function toNonNegativeInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}

export interface HorizontalPaddingConfig {
  padding?: number;
  paddingX?: number;
  paddingLeft?: number;
  paddingRight?: number;
}

export function resolveHorizontalPadding({
  padding,
  paddingX,
  paddingLeft,
  paddingRight,
}: HorizontalPaddingConfig): { paddingLeft: number; paddingRight: number } {
  const base = toNonNegativeInteger(padding);
  const horizontal = paddingX !== undefined ? toNonNegativeInteger(paddingX) : base;
  const left = paddingLeft !== undefined ? toNonNegativeInteger(paddingLeft) : horizontal;
  const right = paddingRight !== undefined ? toNonNegativeInteger(paddingRight) : horizontal;
  return { paddingLeft: left, paddingRight: right };
}

export function extractSpecialKeys(key: Key | null | undefined): string[] {
  if (!key || typeof key !== 'object') {
    return [];
  }

  const ARROW_LABELS: Record<string, string> = {
    upArrow: 'up',
    downArrow: 'down',
    leftArrow: 'left',
    rightArrow: 'right',
  };

  return Object.entries(key)
    .filter((entry): entry is [string, boolean] => {
      const [name, value] = entry;
      return typeof value === 'boolean' && value && name !== 'isShiftPressed';
    })
    .map(([name]) => ARROW_LABELS[name] ?? name);
}

export interface InkTextRow {
  text: string;
  startIndex: number;
}

export interface TransformToRowsOptions {
  paddingLeft?: number;
  paddingRight?: number;
}

/**
 * Break a string into the visual rows rendered by the editor.
 * Rows end either because the terminal width was reached or a newline was encountered.
 */
export function transformToRows(
  source: string,
  maxWidth: number,
  options: TransformToRowsOptions = {},
): InkTextRow[] {
  const { paddingLeft = 0, paddingRight = 0 } = options ?? {};
  const safeWidth = Math.max(1, Math.floor(maxWidth ?? 1));
  const horizontalPadding = toNonNegativeInteger(paddingLeft) + toNonNegativeInteger(paddingRight);
  const effectiveWidth = Math.max(1, safeWidth - horizontalPadding);
  const rows: InkTextRow[] = [];

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

export interface CaretPosition {
  rowIndex: number;
  column: number;
  row: InkTextRow;
}

export function computeCaretPosition(
  rows: ReadonlyArray<InkTextRow>,
  caretIndex: number,
  totalLength: number,
): CaretPosition {
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
    const nextRowStart = index + 1 < rows.length ? rows[index + 1]?.startIndex ?? totalLength : totalLength;

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
