import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { mapHistoryToModelMessages } from './historyEntry.js';
import { MAX_REQUEST_GROWTH_FACTOR } from './runtimeSharedConstants.js';
import type { HistorySnapshot, RuntimeEmitter } from './runtimeTypes.js';

export const DEFAULT_HISTORY_DIR = join(process.cwd(), '.openagent', 'failsafe-history');

const dumpHistorySnapshot = async ({
  historyEntries = [],
  passIndex,
  historyDumpDirectory,
  emitter,
}: {
  historyEntries?: HistorySnapshot | [];
  passIndex?: number | null;
  historyDumpDirectory: string;
  emitter: RuntimeEmitter;
}): Promise<string> => {
  await mkdir(historyDumpDirectory, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const prefix = Number.isFinite(passIndex) ? `pass-${passIndex}-` : 'pass-unknown-';
  const filePath = join(historyDumpDirectory, `${prefix}${timestamp}.json`);
  await writeFile(filePath, JSON.stringify(historyEntries, null, 2), 'utf8');
  emitter.logWithFallback('error', `[failsafe] Dumped history snapshot to ${filePath}.`);
  return filePath;
};

export const estimateRequestPayloadSize = (
  historySnapshot: HistorySnapshot | null | undefined,
  modelName: string | null | undefined,
  emitter: RuntimeEmitter,
): number | null => {
  try {
    const payload = {
      model: modelName,
      input: mapHistoryToModelMessages(historySnapshot),
      tool_choice: { type: 'function', name: 'open-agent' },
    };
    const serialized = JSON.stringify(payload);
    return typeof serialized === 'string' ? Buffer.byteLength(serialized, 'utf8') : null;
  } catch (error) {
    emitter.logWithFallback(
      'warn',
      '[failsafe] Unable to estimate OpenAI payload size before request.',
      {
        error: error instanceof Error ? error.message : String(error),
      },
    );
    return null;
  }
};

// Captures the key measurements we report when the payload balloons unexpectedly.
interface PayloadGrowthAssessment {
  previousSize: number;
  currentSize: number;
  growthFactor: number;
  deltaBytes: number;
}

const asFiniteNumber = (value: number | null): number | null =>
  Number.isFinite(value) ? (value as number) : null;

const assessPayloadGrowth = (
  previousSize: number | null,
  currentSize: number | null,
): PayloadGrowthAssessment | null => {
  const previous = asFiniteNumber(previousSize);
  const current = asFiniteNumber(currentSize);

  if (previous === null || current === null) {
    return null;
  }

  return {
    previousSize: previous,
    currentSize: current,
    growthFactor: previous > 0 ? current / previous : Number.POSITIVE_INFINITY,
    deltaBytes: current - previous,
  };
};

const exceedsGrowthThreshold = (assessment: PayloadGrowthAssessment): boolean =>
  assessment.growthFactor >= MAX_REQUEST_GROWTH_FACTOR && assessment.deltaBytes > 1024;

// Returns a helper that logs the oversize event, persists the history, and exits.
const createFailsafeTerminator = ({
  emitter,
  historyDumpRoot,
}: {
  emitter: RuntimeEmitter;
  historyDumpRoot: string;
}) => {
  const persistHistory = async ({
    historyEntries,
    passIndex,
  }: {
    historyEntries: HistorySnapshot | [];
    passIndex: number | null | undefined;
  }): Promise<void> => {
    try {
      await dumpHistorySnapshot({
        historyEntries,
        passIndex,
        historyDumpDirectory: historyDumpRoot,
        emitter,
      });
    } catch (error) {
      emitter.logWithFallback('error', '[failsafe] Failed to persist history snapshot.', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const terminateProcess = () => {
    emitter.logWithFallback('error', '[failsafe] Exiting to prevent excessive API charges.');
    process.exit(1);
  };

  return async ({
    history,
    passIndex,
    assessment,
  }: {
    history: HistorySnapshot | [];
    passIndex: number | null | undefined;
    assessment: PayloadGrowthAssessment;
  }): Promise<void> => {
    emitter.logWithFallback(
      'error',
      `[failsafe] OpenAI request ballooned from ${assessment.previousSize}B to ${assessment.currentSize}B on pass ${
        passIndex ?? 'unknown'
      }.`,
    );

    await persistHistory({ historyEntries: history, passIndex });
    terminateProcess();
  };
};

export interface PayloadGrowthGuardOptions {
  previousSize: number | null;
  currentSize: number | null;
  history: HistorySnapshot | [];
  passIndex: number | null | undefined;
}

export const createPayloadGrowthMonitor = ({
  emitter,
  historyDumpRoot,
}: {
  emitter: RuntimeEmitter;
  historyDumpRoot: string;
}) => {
  const terminateOnGrowth = createFailsafeTerminator({ emitter, historyDumpRoot });

  return async ({
    previousSize,
    currentSize,
    history,
    passIndex,
  }: PayloadGrowthGuardOptions): Promise<void> => {
    const assessment = assessPayloadGrowth(previousSize, currentSize);

    if (assessment === null || !exceedsGrowthThreshold(assessment)) {
      return;
    }

    await terminateOnGrowth({ history, passIndex, assessment });
  };
};

