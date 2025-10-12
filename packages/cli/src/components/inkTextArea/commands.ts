import type { SlashCommandSelectEvent } from './types.js';
import { clamp } from './layout.js';

export interface SlashCommandItem {
  id: string | number;
  label: string;
  description?: string;
  keywords: string[];
  insertValue?: string;
  source: unknown;
}

export interface SlashCommandFilterContext {
  query: string;
  normalizedQuery: string;
  command: unknown;
  value: string;
  caretIndex: number;
}

export interface SlashCommandDefinition {
  id?: string;
  trigger?: string;
  allowInline?: boolean;
  allowNewlines?: boolean;
  shouldActivate?: (context: SlashCommandActivationContext) => boolean;
  filterItem?: (item: SlashCommandItem, context: SlashCommandFilterContext) => boolean;
  getItems?: (
    context: SlashCommandDynamicContext,
  ) => Promise<SlashCommandSourceItem[]> | SlashCommandSourceItem[];
  items?: SlashCommandSourceItem[];
}

export interface SlashCommandActivationContext {
  value: string;
  caretIndex: number;
  triggerIndex: number;
  query: string;
  precedingChar: string;
  command: unknown;
}

export interface SlashCommandDynamicContext {
  query: string;
  value: string;
  caretIndex: number;
  range: { startIndex: number; endIndex: number };
  command: unknown;
}

export type SlashCommandSourceItem =
  | null
  | undefined
  | string
  | number
  | { [key: string]: unknown };

export interface NormalizedSlashCommand {
  id: string;
  trigger: string;
  triggerLength: number;
  allowNewlines: boolean;
  allowInline: boolean;
  shouldActivate: (context: SlashCommandActivationContext) => boolean;
  filterItem: (item: SlashCommandItem, context: SlashCommandFilterContext) => boolean;
  getItems: SlashCommandDefinition['getItems'] | null;
  staticItems: SlashCommandItem[];
  order: number;
  source: SlashCommandDefinition | null;
}

export interface ActiveSlashCommand {
  command: NormalizedSlashCommand;
  startIndex: number;
  endIndex: number;
  query: string;
}

function isWhitespace(char: string | undefined): boolean {
  if (!char) {
    return false;
  }

  return /\s/u.test(char);
}

function toStringValue(value: unknown, fallback: string): string {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return fallback;
}

export function normalizeSlashItem(
  item: SlashCommandSourceItem,
  index: number,
): SlashCommandItem | null {
  if (!item || typeof item !== 'object') {
    if (typeof item === 'string' || typeof item === 'number') {
      return {
        id: index,
        label: String(item),
        keywords: [],
        source: item,
      };
    }

    return null;
  }

  const labelSource =
    item.label ?? item.title ?? item.name ?? item.id ?? item.key ?? `item-${index}`;
  const label = toStringValue(labelSource, `item-${index}`);
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
    id: (item.id ?? index) as string | number,
    label,
    description,
    keywords,
    insertValue,
    source: item,
  };
}

export function defaultFilterItem(
  item: SlashCommandItem,
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

  const normalizedDescription = item.description?.replace(/\([^)]*\)/gu, ' ') ?? '';

  const haystackParts = [item.label, item.insertValue, normalizedDescription, ...item.keywords]
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

  return tokens.every((token) => haystackParts.some((part) => part.includes(token)));
}

export function normalizeCommandDefinition(
  definition: SlashCommandDefinition,
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
        .filter((value): value is SlashCommandItem => Boolean(value))
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

export function computeActiveCommand(
  value: string,
  caretIndex: number,
  commands: NormalizedSlashCommand[],
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

    const precedingChar = triggerIndex > 0 ? textToCaret[triggerIndex - 1] : '';

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

export function buildSlashCommandEvent(
  activeCommand: ActiveSlashCommand,
  item: SlashCommandItem,
  replacement: string,
  value: string,
): SlashCommandSelectEvent {
  return {
    item: item.source ?? item,
    query: activeCommand.query,
    command: activeCommand.command.source ?? activeCommand.command,
    range: {
      startIndex: activeCommand.startIndex,
      endIndex: activeCommand.endIndex,
    },
    replacement,
    value,
  };
}
