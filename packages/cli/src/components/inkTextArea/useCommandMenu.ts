import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Key } from 'ink';

import { clamp } from './layout.js';
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
} from './commands.js';
import type { SlashCommandSelectEvent } from './types.js';

export interface CommandMatch {
  item: SlashCommandItem;
  index: number;
}

interface CommandCacheEntry {
  signature: string;
  items: SlashCommandItem[];
}

type CommandCache = Record<string, CommandCacheEntry>;

export function buildCommandDefinitions(
  slashMenuItems: ReadonlyArray<SlashCommandSourceItem> | undefined,
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
          .filter((normalized): normalized is SlashCommandItem => Boolean(normalized));

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
  dynamicCommandItems: CommandCache,
  caretIndex: number,
  value: string,
): CommandMatch[] {
  if (!activeCommand) {
    return [];
  }

  const { command } = activeCommand;
  const dynamicItems = dynamicCommandItems[command.id];
  const candidates = dynamicItems?.items ?? command.staticItems;

  const normalizedQuery = activeCommand.query.trim().toLowerCase();
  const filterContext = {
    query: activeCommand.query,
    normalizedQuery,
    command: command.source ?? command,
    value,
    caretIndex,
  };

  const filtered = candidates.filter((item) => command.filterItem(item, filterContext));

  return filtered.map((item, index) => ({ item, index }));
}

interface UseCommandMenuOptions {
  value: string;
  caretIndex: number;
  slashMenuItems?: ReadonlyArray<SlashCommandSourceItem>;
  commandMenus?: ReadonlyArray<SlashCommandDefinition>;
  onSlashCommandSelect?: (event: SlashCommandSelectEvent) => void;
  updateValue: (nextValue: string, nextCaretIndex: number) => void;
}

export interface CommandMenuResult {
  matches: CommandMatch[];
  isVisible: boolean;
  highlightMatch: CommandMatch | null;
  handleNavigation: (key: Key, shouldInsertNewline: boolean) => boolean;
}

export function useCommandMenu({
  value,
  caretIndex,
  slashMenuItems,
  commandMenus,
  onSlashCommandSelect,
  updateValue,
}: UseCommandMenuOptions): CommandMenuResult {
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
  const [commandHighlightIndex, setCommandHighlightIndex] = useState(0);

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
    activeCommand?.command.id,
    activeCommand?.query,
    activeCommand?.startIndex,
    commandHighlightIndex,
    commandMatches.length,
    commandMenuVisible,
  ]);

  const handleCommandSelection = useCallback(() => {
    if (!commandMenuVisible || !activeCommand || commandMatches.length === 0) {
      return false;
    }

    const match =
      commandMatches[Math.min(commandHighlightIndex, commandMatches.length - 1)] ??
      commandMatches[0];

    if (!match) {
      return false;
    }

    const { item } = match;
    const replacement = item.insertValue ?? '';
    const before = value.slice(0, activeCommand.startIndex);
    const after = value.slice(activeCommand.endIndex);
    const nextValue = `${before}${replacement}${after}`;
    const nextCaretIndex = before.length + replacement.length;

    updateValue(nextValue, nextCaretIndex);
    const caretIndexBefore = caretIndex;
    const valueBefore = value;
    onSlashCommandSelect?.(
      buildSlashCommandEvent(activeCommand, item, replacement, nextValue, caretIndexBefore, valueBefore),
    );

    setCommandHighlightIndex(0);
    return true;
  }, [
    activeCommand,
    commandHighlightIndex,
    commandMatches,
    commandMenuVisible,
    onSlashCommandSelect,
    updateValue,
    value,
    caretIndex,
  ]);

  const handleNavigation = useCallback(
    (key: Key, shouldInsertNewline: boolean) => {
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
    },
    [commandMatches.length, commandMenuVisible, handleCommandSelection],
  );

  const highlightMatch = useMemo<CommandMatch | null>(() => {
    if (!commandMenuVisible || commandMatches.length === 0) {
      return null;
    }
    const index = Math.min(commandHighlightIndex, commandMatches.length - 1);
    return commandMatches[index] ?? null;
  }, [commandHighlightIndex, commandMatches, commandMenuVisible]);

  return {
    matches: commandMatches,
    isVisible: commandMenuVisible,
    highlightMatch,
    handleNavigation,
  };
}
