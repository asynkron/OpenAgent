import { join } from 'node:path';

import { mapHistoryToModelMessages } from './historyEntry.js';
import { requestModelCompletion as defaultRequestModelCompletion } from './modelRequest.js';
import { enforcePayloadGrowthLimit } from './runtimePayloadFailsafe.js';
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
      error instanceof Error ? error.message : String(error),
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
    if (!Number.isFinite(payloadSize)) {
      return null;
    }

    await enforcePayloadGrowthLimit({
      currentSize: payloadSize as number,
      previousSize: lastTransmittedPayloadSize,
      history: options?.history,
      passIndex: options?.passIndex,
      historyDumpDirectory: historyDumpRoot,
      emitter,
    });

    return payloadSize as number;
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
