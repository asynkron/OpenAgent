import { createEscState } from './escState.js';
import {
  approvalManagerFactoryFallback,
  defaultPlanAutoResponseTracker,
  initializeWithFactory,
  planManagerFactoryFallback,
  promptCoordinatorFactoryFallback,
} from './runtimeFactories.js';
import type {
  ApprovalManagerFactoryConfig,
  EscController,
  PlanAutoResponseTracker,
  PlanManagerFactoryConfig,
  PromptCoordinatorFactoryConfig,
  PromptCoordinatorLike,
  RuntimeEmitter,
} from './runtimeTypes.js';
import type { PlanManagerOptions } from './planManager.js';
import type { PlanManagerLike as ExecutorPlanManagerLike } from './passExecutor/planManagerAdapter.js';
import type { EscStateController } from './escState.js';

/**
 * Helper factories that keep `loop.ts` focused on control flow.
 * Each helper owns a DI surface so warnings and fallbacks stay centralized.
 */
export interface PlanManagerBundleOptions {
  emitter: RuntimeEmitter;
  planManagerOptions: PlanManagerOptions;
  getPlanMergeFlag: () => boolean;
  createPlanManagerFn?: (
    config: PlanManagerFactoryConfig,
  ) => ReturnType<typeof planManagerFactoryFallback>;
  createPlanAutoResponseTrackerFn?: () => PlanAutoResponseTracker | null;
}

export interface PlanManagerBundle {
  planManager: ReturnType<typeof planManagerFactoryFallback> | null;
  planManagerForExecutor: ExecutorPlanManagerLike | null;
  planAutoResponseTracker: PlanAutoResponseTracker;
}

export const createPlanManagerBundle = ({
  emitter,
  planManagerOptions,
  getPlanMergeFlag,
  createPlanManagerFn,
  createPlanAutoResponseTrackerFn,
}: PlanManagerBundleOptions): PlanManagerBundle => {
  const planManagerConfig: PlanManagerFactoryConfig = {
    ...planManagerOptions,
    getPlanMergeFlag,
  };

  const planManager = initializeWithFactory<
    ReturnType<typeof planManagerFactoryFallback> | null,
    PlanManagerFactoryConfig
  >({
    factory: createPlanManagerFn,
    fallback: planManagerFactoryFallback,
    config: planManagerConfig,
    warnMessage: 'Failed to initialize plan manager via factory.',
    onInvalid: (candidate) =>
      emitter.emitFactoryWarning(
        'Plan manager factory returned an invalid value.',
        candidate == null ? String(candidate) : `typeof candidate === ${typeof candidate}`,
      ),
    emitter,
  });

  const maybeTracker: PlanAutoResponseTracker | null =
    typeof createPlanAutoResponseTrackerFn === 'function'
      ? (createPlanAutoResponseTrackerFn() ?? null)
      : null;

  const planAutoResponseTracker: PlanAutoResponseTracker =
    maybeTracker &&
    typeof maybeTracker.increment === 'function' &&
    typeof maybeTracker.reset === 'function' &&
    typeof maybeTracker.getCount === 'function'
      ? maybeTracker
      : defaultPlanAutoResponseTracker();

  const planManagerForExecutor: ExecutorPlanManagerLike | null =
    planManager && typeof planManager === 'object'
      ? (planManager as unknown as ExecutorPlanManagerLike)
      : null;

  return { planManager, planManagerForExecutor, planAutoResponseTracker };
};

export interface PromptCoordinatorBundleOptions {
  emitter: RuntimeEmitter;
  emit: RuntimeEmitter['emit'];
  cancelFn?: (reason?: unknown) => void;
  createEscStateFn?: () => EscStateController;
  createPromptCoordinatorFn?: (config: PromptCoordinatorFactoryConfig) => PromptCoordinatorLike;
}

export interface PromptCoordinatorBundle {
  promptCoordinator: PromptCoordinatorLike;
  escController: EscController;
}

export const createPromptCoordinatorBundle = ({
  emitter,
  emit,
  cancelFn,
  createEscStateFn,
  createPromptCoordinatorFn,
}: PromptCoordinatorBundleOptions): PromptCoordinatorBundle => {
  const fallbackEscController: EscStateController = createEscState();
  let escController: EscController = {
    state: fallbackEscController.state,
    trigger: fallbackEscController.trigger ?? null,
    detach: fallbackEscController.detach ?? null,
  };

  try {
    const candidate = typeof createEscStateFn === 'function' ? createEscStateFn() : null;
    if (candidate && typeof candidate === 'object') {
      escController = {
        state: candidate.state ?? fallbackEscController.state,
        trigger:
          typeof candidate.trigger === 'function'
            ? candidate.trigger
            : (fallbackEscController.trigger ?? null),
        detach:
          typeof candidate.detach === 'function'
            ? candidate.detach
            : (fallbackEscController.detach ?? null),
      };
    }
  } catch (error) {
    emit({
      type: 'status',
      level: 'warn',
      message: 'Failed to initialize ESC state via factory.',
      details: error instanceof Error ? error.message : String(error),
    });
  }

  const promptCoordinatorConfig: PromptCoordinatorFactoryConfig = {
    emitEvent: (event) => emit(event),
    escState: {
      ...escController.state,
      trigger: escController.trigger ?? escController.state.trigger,
    },
    cancelFn,
  };

  const promptCoordinator = initializeWithFactory<
    PromptCoordinatorLike,
    PromptCoordinatorFactoryConfig
  >({
    factory: createPromptCoordinatorFn,
    fallback: promptCoordinatorFactoryFallback,
    config: promptCoordinatorConfig,
    warnMessage: 'Failed to initialize prompt coordinator via factory.',
    onInvalid: (candidate) =>
      emitter.emitFactoryWarning(
        'Prompt coordinator factory returned an invalid value.',
        candidate == null ? String(candidate) : `typeof candidate === ${typeof candidate}`,
      ),
    emitter,
  });

  return { promptCoordinator, escController };
};

export interface ApprovalManagerOptions {
  emitter: RuntimeEmitter;
  createApprovalManagerFn?: (
    config: ApprovalManagerFactoryConfig,
  ) => ReturnType<typeof approvalManagerFactoryFallback> | null;
  config: ApprovalManagerFactoryConfig;
}

export const createApprovalManager = ({
  emitter,
  createApprovalManagerFn,
  config,
}: ApprovalManagerOptions): ReturnType<typeof approvalManagerFactoryFallback> =>
  initializeWithFactory<
    ReturnType<typeof approvalManagerFactoryFallback>,
    ApprovalManagerFactoryConfig
  >({
    factory: createApprovalManagerFn,
    fallback: approvalManagerFactoryFallback,
    config,
    warnMessage: 'Failed to initialize approval manager via factory.',
    onInvalid: (candidate) =>
      emitter.emitFactoryWarning(
        'Approval manager factory returned an invalid value.',
        candidate == null ? String(candidate) : `typeof candidate === ${typeof candidate}`,
      ),
    emitter,
  });
