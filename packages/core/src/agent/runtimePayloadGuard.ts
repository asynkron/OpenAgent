import { requestModelCompletion as defaultRequestModelCompletion } from './modelRequest.js';
import {
  DEFAULT_HISTORY_DIR,
  createPayloadGrowthMonitor,
  estimateRequestPayloadSize,
} from './runtimePayloadGuardSupport.js';
import type {
  GuardableRequestModelCompletion,
  GuardedRequestModelCompletion,
  GuardRequestOptions,
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

  const guardAgainstExcessiveGrowth = createPayloadGrowthMonitor({
    emitter,
    historyDumpRoot,
  });

  const evaluateRequestPayloadSize = async (
    options: GuardRequestPayloadSizeInput | GuardRequestOptions,
  ): Promise<number | null> => {
    const payloadSize = estimateRequestPayloadSize(options?.history, options?.model, emitter);

    await guardAgainstExcessiveGrowth({
      previousSize: lastTransmittedPayloadSize,
      currentSize: payloadSize,
      history: options?.history ?? [],
      passIndex: options?.passIndex ?? null,
    });

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

