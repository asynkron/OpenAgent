import { useCallback } from 'react';

import type { ChatMessageEntry } from '@asynkron/openagent-core';
import type { AgentRuntimeLike, SlashCommandHandler, TimelinePayload } from './types.js';
import { writeHistorySnapshot } from './history.js';

export interface UseHistoryCommandOptions {
  getRuntime: () => AgentRuntimeLike | null;
  appendStatus: (status: TimelinePayload<'status'>) => void;
}

/**
 * Handles the `/history` slash command by delegating to the runtime and filesystem helper.
 */
export function useHistoryCommand({ getRuntime, appendStatus }: UseHistoryCommandOptions): {
  handleHistoryCommand: SlashCommandHandler;
} {
  const executeHistoryCommand = useCallback(
    async (pathInput: string) => {
      const runtime = getRuntime();
      if (!runtime || typeof runtime.getHistorySnapshot !== 'function') {
        appendStatus({
          level: 'error',
          message: 'History snapshot is unavailable for this session.',
        });
        return;
      }

      let historyEntries: readonly ChatMessageEntry[] = [];
      try {
        const snapshot = runtime.getHistorySnapshot();
        historyEntries = Array.isArray(snapshot) ? snapshot : [];
      } catch (error) {
        appendStatus({
          level: 'error',
          message: 'Failed to read history from the runtime.',
          details: error instanceof Error ? error.message : String(error),
        });
        return;
      }

      try {
        const targetPath = await writeHistorySnapshot({
          history: [...historyEntries],
          filePath: pathInput,
        });
        appendStatus({ level: 'info', message: `Saved history to ${targetPath}.` });
      } catch (error) {
        appendStatus({
          level: 'error',
          message: 'Failed to write history file.',
          details: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [appendStatus, getRuntime],
  );

  const handleHistoryCommand = useCallback<SlashCommandHandler>(
    async (pathInput) => {
      await executeHistoryCommand(pathInput);
      return true;
    },
    [executeHistoryCommand],
  );

  return { handleHistoryCommand };
}
