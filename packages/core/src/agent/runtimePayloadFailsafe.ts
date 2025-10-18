import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { HistorySnapshot, RuntimeEmitter } from './runtimeTypes.js';

interface DumpHistoryInput {
  historyEntries: HistorySnapshot | [];
  passIndex: number | null;
  historyDumpDirectory: string;
  emitter: RuntimeEmitter;
}

interface PayloadGrowthCheckInput {
  baseline: number | null;
  candidate: number | null;
  history: HistorySnapshot | null | undefined;
  passIndex: number | null | undefined;
  emitter: RuntimeEmitter;
  historyDumpDirectory: string;
}

const dumpHistorySnapshot = async ({
  historyEntries,
  passIndex,
  historyDumpDirectory,
  emitter,
}: DumpHistoryInput): Promise<void> => {
  await mkdir(historyDumpDirectory, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const prefix = Number.isFinite(passIndex) ? `pass-${passIndex}-` : 'pass-unknown-';
  const filePath = join(historyDumpDirectory, `${prefix}${timestamp}.json`);
  await writeFile(filePath, JSON.stringify(historyEntries, null, 2), 'utf8');
  emitter.logWithFallback('error', `[failsafe] Dumped history snapshot to ${filePath}.`);
};

// Keeps number guards in one place so the control flow below reads linearly.
export const isFinitePayloadSize = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value);

// Mirrors the original growth check while making the intent explicit for future readers.
const shouldTriggerFailsafe = (baseline: number, candidate: number, growthFactorLimit: number): boolean => {
  const growthFactor = baseline > 0 ? candidate / baseline : Number.POSITIVE_INFINITY;
  const increasedByMoreThanKilobyte = candidate - baseline > 1024;
  return growthFactor >= growthFactorLimit && increasedByMoreThanKilobyte;
};

// Centralizes the dump + exit flow so it stays isolated from the guard wiring.
export const ensurePayloadGrowthWithinBounds = async ({
  baseline,
  candidate,
  history,
  passIndex,
  emitter,
  historyDumpDirectory,
  growthFactorLimit,
}: PayloadGrowthCheckInput & { growthFactorLimit: number }): Promise<void> => {
  if (!isFinitePayloadSize(baseline) || !isFinitePayloadSize(candidate)) {
    return;
  }

  const resolvedPassIndex = typeof passIndex === 'number' && Number.isFinite(passIndex) ? passIndex : null;

  if (!shouldTriggerFailsafe(baseline, candidate, growthFactorLimit)) {
    return;
  }

  emitter.logWithFallback(
    'error',
    `[failsafe] OpenAI request ballooned from ${baseline}B to ${candidate}B on pass ${
      resolvedPassIndex ?? 'unknown'
    }.`,
  );

  try {
    await dumpHistorySnapshot({
      historyEntries: history ?? [],
      passIndex: resolvedPassIndex,
      historyDumpDirectory,
      emitter,
    });
  } catch (dumpError) {
    emitter.logWithFallback('error', '[failsafe] Failed to persist history snapshot.', {
      error: dumpError instanceof Error ? dumpError.message : String(dumpError),
    });
  }

  emitter.logWithFallback('error', '[failsafe] Exiting to prevent excessive API charges.');
  process.exit(1);
};
