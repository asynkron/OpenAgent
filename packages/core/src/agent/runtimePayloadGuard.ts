import { join } from 'node:path';

import { mapHistoryToModelMessages } from './historyEntry.js';
import { requestModelCompletion as defaultRequestModelCompletion } from './modelRequest.js';
import {
  enforcePayloadFailsafe,
  isPayloadGrowthUnsafe,
} from './runtimePayloadFailsafe.js';
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
} from './passExecutor/types.js';

interface PayloadGuardConfig {
  historyDumpRoot?: string;
  emitter: RuntimeEmitter;
}

const DEFAULT_HISTORY_DIR = join(process.cwd(), '.openagent', 'failsafe-history');

const toFiniteNumber = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const estimateRequestPayloadSize = (
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
    const normalized = toFiniteNumber(payloadSize);
    if (normalized !== null) {
      lastTransmittedPayloadSize = normalized;
    }
  };

  const evaluateRequestPayloadSize = async (
    options: GuardRequestPayloadSizeInput | GuardRequestOptions,
  ): Promise<number | null> => {
    const payloadSize = estimateRequestPayloadSize(options?.history, options?.model, emitter);
    const previous = toFiniteNumber(lastTransmittedPayloadSize);
    const current = toFiniteNumber(payloadSize);

    if (previous !== null && current !== null && isPayloadGrowthUnsafe({ previous, current })) {
      const historyEntries = options?.history ?? [];
      await enforcePayloadFailsafe({
        growth: { previous, current },
        historyEntries,
        historyDumpDirectory: historyDumpRoot,
        passIndex: options?.passIndex,
        emitter,
      });
    }

    return current;
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
