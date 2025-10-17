import { ApprovalManager } from './approvalManager.js';
import { createPlanManager } from './planManager.js';
import { PromptCoordinator } from './promptCoordinator.js';
import type {
  ApprovalManagerFactoryConfig,
  PlanManagerFactoryConfig,
  PromptCoordinatorFactoryConfig,
  RuntimeEmitter,
} from './runtimeTypes.js';
import type { PlanAutoResponseTracker } from './passExecutor/planReminderController.js';

export interface InitializeWithFactoryOptions<TCandidate, TConfig> {
  factory?: ((config: TConfig) => TCandidate | null | undefined) | null;
  fallback: (config: TConfig) => TCandidate;
  config: TConfig;
  warnMessage?: string;
  onInvalid?: (candidate: unknown) => void;
  validate?: (candidate: unknown) => candidate is TCandidate;
  emitter: RuntimeEmitter;
}

export function initializeWithFactory<TCandidate, TConfig>({
  factory,
  fallback,
  config,
  warnMessage,
  onInvalid,
  validate,
  emitter,
}: InitializeWithFactoryOptions<TCandidate, TConfig>): TCandidate {
  if (typeof factory === 'function') {
    try {
      const candidate = factory(config);
      const validator =
        typeof validate === 'function'
          ? validate
          : (value: unknown): value is TCandidate => Boolean(value && typeof value === 'object');

      if (validator(candidate)) {
        return candidate;
      }

      onInvalid?.(candidate);
    } catch (error) {
      if (warnMessage) {
        emitter.emitFactoryWarning(warnMessage, error);
      }
      return fallback(config);
    }
  }

  return fallback(config);
}

export const defaultPlanAutoResponseTracker = (): PlanAutoResponseTracker => {
  let count = 0;
  return {
    increment() {
      count += 1;
      return count;
    },
    reset() {
      count = 0;
    },
    getCount() {
      return count;
    },
  };
};

export const planManagerFactoryFallback = (
  config: PlanManagerFactoryConfig,
): ReturnType<typeof createPlanManager> =>
  createPlanManager({ emit: config.emit, emitStatus: config.emitStatus });

export const promptCoordinatorFactoryFallback = (config: PromptCoordinatorFactoryConfig) =>
  new PromptCoordinator(config);

export const approvalManagerFactoryFallback = (config: ApprovalManagerFactoryConfig) =>
  new ApprovalManager(config);
