import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { mapHistoryToModelMessages } from './historyEntry.js';
import { requestModelCompletion as defaultRequestModelCompletion } from './modelRequest.js';
import { MAX_REQUEST_GROWTH_FACTOR } from './runtimeSharedConstants.js';
import type {
  GuardableRequestModelCompletion,
  GuardedRequestModelCompletion,
  GuardRequestOptions,
  HistorySnapshot,
  RuntimeEmitter,
} from './runtimeTypes.js';
import type {
  GuardRequestPayloadSizeFn,
  GuardRequestPayloadSizeInput,
  RecordRequestPayloadSizeFn,
} from './passExecutor/prePassTasks.js';

interface PayloadGuardConfig {
  historyDumpRoot?: string;
  emitter: RuntimeEmitter;
}

const DEFAULT_HISTORY_DIR = join(process.cwd(), '.openagent', 'failsafe-history');

async function dumpHistorySnapshot({
  historyEntries = [],
  passIndex,
  historyDumpDirectory,
  emitter,
}: {
  historyEntries?: HistorySnapshot | unknown[];
  passIndex?: number | null;
  historyDumpDirectory: string;
  emitter: RuntimeEmitter;
}): Promise<string> {
  await mkdir(historyDumpDirectory, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const prefix = Number.isFinite(passIndex) ? `pass-${passIndex}-` : 'pass-unknown-';
  const filePath = join(historyDumpDirectory, `${prefix}${timestamp}.json`);
  await writeFile(filePath, JSON.stringify(historyEntries, null, 2), 'utf8');
  emitter.logWithFallback('error', `[failsafe] Dumped history snapshot to ${filePath}.`);
  return filePath;
}

const estimateRequestPayloadSize = (
  historySnapshot: unknown,
  modelName: unknown,
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

export function createPayloadGuard({
  historyDumpRoot = DEFAULT_HISTORY_DIR,
  emitter,
}: PayloadGuardConfig): {
  buildGuardedRequestModelCompletion: (
    delegate: GuardableRequestModelCompletion | null | undefined,
  ) => GuardedRequestModelCompletion;
} {
  let lastTransmittedPayloadSize: number | null = null;

  const recordPayloadSize = (payloadSize: number | null): void => {
    if (Number.isFinite(payloadSize)) {
      lastTransmittedPayloadSize = payloadSize as number;
    }
  };

  const evaluateRequestPayloadSize = async (
    options: GuardRequestPayloadSizeInput | GuardRequestOptions,
  ): Promise<number | null> => {
    const payloadSize = estimateRequestPayloadSize(options?.history, options?.model, emitter);
    if (Number.isFinite(lastTransmittedPayloadSize) && Number.isFinite(payloadSize)) {
      const previous = lastTransmittedPayloadSize as number;
      const current = payloadSize as number;
      const growthFactor = previous > 0 ? current / previous : Number.POSITIVE_INFINITY;

      if (growthFactor >= MAX_REQUEST_GROWTH_FACTOR && current - previous > 1024) {
        emitter.logWithFallback(
          'error',
          `[failsafe] OpenAI request ballooned from ${previous}B to ${current}B on pass ${
            options?.passIndex ?? 'unknown'
          }.`,
        );

        try {
          await dumpHistorySnapshot({
            historyEntries: Array.isArray(options?.history) ? options.history : [],
            passIndex: options?.passIndex,
            historyDumpDirectory: historyDumpRoot,
            emitter,
          });
        } catch (dumpError) {
          emitter.logWithFallback('error', '[failsafe] Failed to persist history snapshot.', {
            error: dumpError instanceof Error ? dumpError.message : String(dumpError),
          });
        }

        emitter.logWithFallback('error', '[failsafe] Exiting to prevent excessive API charges.');
        process.exit(1);
      }
    }

    return Number.isFinite(payloadSize) ? (payloadSize as number) : null;
  };

  const buildGuardedRequestModelCompletion = (
    delegate: GuardableRequestModelCompletion | null | undefined,
  ): GuardedRequestModelCompletion => {
    const requestFn: GuardableRequestModelCompletion =
      typeof delegate === 'function' ? delegate : defaultRequestModelCompletion;

    const guardedRequest = Object.assign(
      async (options: GuardRequestOptions) => {
        const payloadSize = await evaluateRequestPayloadSize(options);
        const result = await requestFn(options);
        recordPayloadSize(payloadSize);
        return result;
      },
      {
        guardRequestPayloadSize: (async ({ history, model, passIndex }) => {
          await evaluateRequestPayloadSize({ history, model, passIndex });
        }) as GuardRequestPayloadSizeFn,
        recordRequestPayloadBaseline: (async ({ history, model }) => {
          const size = estimateRequestPayloadSize(history, model, emitter);
          recordPayloadSize(size);
        }) as RecordRequestPayloadSizeFn,
      },
    );

    return guardedRequest;
  };

  return { buildGuardedRequestModelCompletion };
}
