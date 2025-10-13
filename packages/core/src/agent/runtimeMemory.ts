import { applyDementiaPolicy as defaultApplyDementiaPolicy } from './amnesiaManager.js';
import type {
  AmnesiaManager as AmnesiaManagerType,
  ChatHistoryEntry as AmnesiaHistoryEntry,
} from './amnesiaManager.js';
import type { HistorySnapshot, RuntimeEmitter } from './runtimeTypes.js';

export interface MemoryPolicyController {
  enforcePolicies(pass: number): void;
}

export interface MemoryPolicyOptions {
  history: HistorySnapshot;
  emitter: RuntimeEmitter;
  emitDebug: RuntimeEmitter['emitDebug'];
  amnesiaLimit?: number;
  dementiaLimit?: number;
  createAmnesiaManagerFn?: (options: { threshold: number }) => AmnesiaManagerType;
  applyDementiaPolicyFn?: typeof defaultApplyDementiaPolicy;
  defaultApplyDementiaPolicy?: typeof defaultApplyDementiaPolicy;
}

/**
 * Builds a reusable memory policy enforcer so the main loop can stay focused
 * on conversational control flow.
 */
export const createMemoryPolicyController = ({
  history,
  emitter,
  emitDebug,
  amnesiaLimit,
  dementiaLimit,
  createAmnesiaManagerFn,
  applyDementiaPolicyFn,
  defaultApplyDementiaPolicy: fallbackApplyDementiaPolicy = defaultApplyDementiaPolicy,
}: MemoryPolicyOptions): MemoryPolicyController => {
  const normalizedAmnesiaLimit =
    typeof amnesiaLimit === 'number' && Number.isFinite(amnesiaLimit) && amnesiaLimit > 0
      ? Math.floor(amnesiaLimit)
      : 0;

  const normalizedDementiaLimit =
    typeof dementiaLimit === 'number' && Number.isFinite(dementiaLimit) && dementiaLimit > 0
      ? Math.floor(dementiaLimit)
      : 0;

  let amnesiaManager: AmnesiaManagerType | null = null;
  if (normalizedAmnesiaLimit > 0 && typeof createAmnesiaManagerFn === 'function') {
    try {
      amnesiaManager = createAmnesiaManagerFn({ threshold: normalizedAmnesiaLimit });
    } catch (error) {
      emitter.emit({
        type: 'status',
        level: 'warn',
        message: '[memory] Failed to initialize amnesia manager.',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const applyDementia = applyDementiaPolicyFn ?? fallbackApplyDementiaPolicy;

  const enforcePolicies = (currentPass: number): void => {
    if (!Number.isFinite(currentPass) || currentPass <= 0) {
      return;
    }

    let mutated = false;

    if (amnesiaManager && typeof amnesiaManager.apply === 'function') {
      try {
        mutated =
          amnesiaManager.apply({
            history: history as unknown as AmnesiaHistoryEntry[],
            currentPass,
          }) || mutated;
      } catch (error) {
        emitter.emit({
          type: 'status',
          level: 'warn',
          message: '[memory] Failed to apply amnesia filter.',
          details: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (normalizedDementiaLimit > 0) {
      try {
        mutated =
          applyDementia({
            history: history as unknown as AmnesiaHistoryEntry[],
            currentPass,
            limit: normalizedDementiaLimit,
          }) || mutated;
      } catch (error) {
        emitter.emit({
          type: 'status',
          level: 'warn',
          message: '[memory] Failed to apply dementia pruning.',
          details: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (mutated) {
      emitDebug(() => ({
        stage: 'memory-policy-applied',
        historyLength: history.length,
      }));
    }
  };

  return { enforcePolicies };
};
