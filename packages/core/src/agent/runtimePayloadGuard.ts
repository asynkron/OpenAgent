import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { mapHistoryToOpenAIMessages } from './historyEntry.js';
import { requestModelCompletion as defaultRequestModelCompletion } from './openaiRequest.js';
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
      input: mapHistoryToOpenAIMessages(historySnapshot),
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
  let previousRequestPayloadSize: number | null = null;

  const evaluateRequestPayloadSize = async (
    options: GuardRequestPayloadSizeInput | GuardRequestOptions,
  ): Promise<void> => {
    const payloadSize = estimateRequestPayloadSize(options?.history, options?.model, emitter);
    if (Number.isFinite(previousRequestPayloadSize) && Number.isFinite(payloadSize)) {
      const previous = previousRequestPayloadSize as number;
      const current = payloadSize as number;
      const growthFactor = current / previous;

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

    if (Number.isFinite(payloadSize)) {
      previousRequestPayloadSize = payloadSize as number;
    }
  };

  const buildGuardedRequestModelCompletion = (
    delegate: GuardableRequestModelCompletion | null | undefined,
  ): GuardedRequestModelCompletion => {
    const requestFn: GuardableRequestModelCompletion =
      typeof delegate === 'function' ? delegate : defaultRequestModelCompletion;

    const guardedRequest = Object.assign(
      async (options: GuardRequestOptions) => {
        await evaluateRequestPayloadSize(options);
        return requestFn(options);
      },
      {
        guardRequestPayloadSize: (async ({ history, model, passIndex }) =>
          evaluateRequestPayloadSize({ history, model, passIndex })) as GuardRequestPayloadSizeFn,
      },
    );

    return guardedRequest;
  };

  return { buildGuardedRequestModelCompletion };
}
