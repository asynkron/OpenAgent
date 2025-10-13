import { useCallback } from 'react';

import type { SlashCommandHandler, SlashCommandRouter } from './types.js';

export type ParsedSlashCommand = {
  name: string;
  rest: string;
};

export function parseSlashCommandInput(value: string): ParsedSlashCommand | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed.startsWith('/')) {
    return null;
  }

  const withoutPrefix = trimmed.slice(1).trim();
  if (!withoutPrefix) {
    return null;
  }

  const [rawName, ...restParts] = withoutPrefix.split(/\s+/u);
  if (!rawName) {
    return null;
  }

  return {
    name: rawName.toLowerCase(),
    rest: restParts.join(' ').trim(),
  };
}

export function useSlashCommandRouter(handlers: Map<string, SlashCommandHandler>): SlashCommandRouter {
  return useCallback<SlashCommandRouter>(
    async (submission) => {
      const parsed = parseSlashCommandInput(submission);
      if (!parsed) {
        return false;
      }

      const handler = handlers.get(parsed.name);
      if (!handler) {
        return false;
      }

      const result = await handler(parsed.rest);
      return result !== false;
    },
    [handlers],
  );
}
