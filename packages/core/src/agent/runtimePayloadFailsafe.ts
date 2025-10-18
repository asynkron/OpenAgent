import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { MAX_REQUEST_GROWTH_FACTOR } from './runtimeSharedConstants.js';
import type { HistorySnapshot, RuntimeEmitter } from './runtimeTypes.js';

interface DumpHistorySnapshotOptions {
  readonly historyEntries?: HistorySnapshot | [];
  readonly passIndex?: number | null;
  readonly historyDumpDirectory: string;
  readonly emitter: RuntimeEmitter;
}

const MINIMUM_SIZE_DELTA_BYTES = 1024;

async function dumpHistorySnapshot({
  historyEntries = [],
  passIndex,
  historyDumpDirectory,
  emitter,
}: DumpHistorySnapshotOptions): Promise<void> {
  await mkdir(historyDumpDirectory, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const prefix = Number.isFinite(passIndex) ? `pass-${passIndex}-` : 'pass-unknown-';
  const filePath = join(historyDumpDirectory, `${prefix}${timestamp}.json`);
  await writeFile(filePath, JSON.stringify(historyEntries, null, 2), 'utf8');
  emitter.logWithFallback('error', `[failsafe] Dumped history snapshot to ${filePath}.`);
}

export interface PayloadGrowthLimitInput {
  readonly previousSize: number | null;
  readonly currentSize: number;
  readonly history: HistorySnapshot | [] | null | undefined;
  readonly passIndex: number | null | undefined;
  readonly historyDumpDirectory: string;
  readonly emitter: RuntimeEmitter;
}

const shouldTriggerFailsafe = ({ previousSize, currentSize }: PayloadGrowthLimitInput): boolean => {
  if (!Number.isFinite(previousSize) || previousSize === null) {
    return false;
  }

  if (previousSize <= 0) {
    return false;
  }

  const growthFactor = currentSize / previousSize;
  const exceedsAbsoluteDelta = currentSize - previousSize > MINIMUM_SIZE_DELTA_BYTES;
  return growthFactor >= MAX_REQUEST_GROWTH_FACTOR && exceedsAbsoluteDelta;
};

const logGrowthWarning = ({ previousSize, currentSize, passIndex, emitter }: PayloadGrowthLimitInput): void => {
  emitter.logWithFallback(
    'error',
    `[failsafe] OpenAI request ballooned from ${previousSize ?? 'unknown'}B to ${currentSize}B on pass ${
      passIndex ?? 'unknown'
    }.`,
  );
};

// Guard the runtime against runaway payload growth by persisting diagnostics and exiting early.
export const enforcePayloadGrowthLimit = async (
  input: PayloadGrowthLimitInput,
): Promise<void> => {
  if (!shouldTriggerFailsafe(input)) {
    return;
  }

  logGrowthWarning(input);

  try {
    await dumpHistorySnapshot({
      historyEntries: input.history ?? [],
      passIndex: input.passIndex,
      historyDumpDirectory: input.historyDumpDirectory,
      emitter: input.emitter,
    });
  } catch (dumpError) {
    input.emitter.logWithFallback(
      'error',
      '[failsafe] Failed to persist history snapshot.',
      dumpError instanceof Error ? dumpError.message : String(dumpError),
    );
  }

  input.emitter.logWithFallback('error', '[failsafe] Exiting to prevent excessive API charges.');
  process.exit(1);
};
