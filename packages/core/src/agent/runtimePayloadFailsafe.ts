import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { MAX_REQUEST_GROWTH_FACTOR } from './runtimeSharedConstants.js';
import type { HistorySnapshot, RuntimeEmitter } from './runtimeTypes.js';

const MIN_ABSOLUTE_GROWTH_BYTES = 1024;

export interface PayloadGrowthSnapshot {
  previous: number;
  current: number;
}

// Snapshots are timestamped so operators can investigate each runaway payload separately.
const buildHistoryFilePath = (
  historyDumpDirectory: string,
  passIndex: number | null | undefined,
): string => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const prefix = Number.isFinite(passIndex) ? `pass-${passIndex}-` : 'pass-unknown-';
  return join(historyDumpDirectory, `${prefix}${timestamp}.json`);
};

// Flags requests that jump beyond the configured growth factor while also growing by >1 KiB.
export const isPayloadGrowthUnsafe = ({ previous, current }: PayloadGrowthSnapshot): boolean => {
  if (previous <= 0) {
    return false;
  }

  const absoluteGrowth = current - previous;
  if (absoluteGrowth <= MIN_ABSOLUTE_GROWTH_BYTES) {
    return false;
  }

  const growthFactor = current / previous;
  return growthFactor >= MAX_REQUEST_GROWTH_FACTOR;
};

const persistHistorySnapshot = async ({
  historyEntries,
  historyDumpDirectory,
  passIndex,
  emitter,
}: {
  historyEntries: HistorySnapshot | [];
  historyDumpDirectory: string;
  passIndex?: number | null;
  emitter: RuntimeEmitter;
}): Promise<void> => {
  await mkdir(historyDumpDirectory, { recursive: true });
  const filePath = buildHistoryFilePath(historyDumpDirectory, passIndex ?? null);
  await writeFile(filePath, JSON.stringify(historyEntries, null, 2), 'utf8');
  emitter.logWithFallback('error', `[failsafe] Dumped history snapshot to ${filePath}.`);
};

export const enforcePayloadFailsafe = async ({
  growth,
  historyEntries,
  historyDumpDirectory,
  passIndex,
  emitter,
}: {
  growth: PayloadGrowthSnapshot;
  historyEntries: HistorySnapshot | [];
  historyDumpDirectory: string;
  passIndex?: number | null;
  emitter: RuntimeEmitter;
}): Promise<never> => {
  const { previous, current } = growth;

  emitter.logWithFallback(
    'error',
    `[failsafe] OpenAI request ballooned from ${previous}B to ${current}B on pass ${
      Number.isFinite(passIndex) ? passIndex : 'unknown'
    }.`,
  );

  try {
    await persistHistorySnapshot({
      historyEntries,
      historyDumpDirectory,
      passIndex,
      emitter,
    });
  } catch (error) {
    emitter.logWithFallback('error', '[failsafe] Failed to persist history snapshot.', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Force a hard stop once the offending history has been captured for inspection.
  emitter.logWithFallback('error', '[failsafe] Exiting to prevent excessive API charges.');
  process.exit(1);
};
