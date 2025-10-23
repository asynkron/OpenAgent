import { RuntimeEventType } from '../contracts/events.js';
/**
 * Implements the interactive agent loop that now emits structured events instead of
 * writing directly to the CLI.
 */

import { SYSTEM_PROMPT } from '../config/systemPrompt.js';
import { getOpenAIClient, MODEL } from '../openai/client.js';
import type { ResponsesClient } from '../openai/responses.js';
import { runCommand } from '../commands/run.js';
import {
  isPreapprovedCommand,
  isSessionApproved,
  approveForSession,
  PREAPPROVED_CFG,
} from '../services/commandApprovalService.js';
import { applyFilter, tailLines } from '../utils/text.js';
import { executeAgentPass } from './passExecutor.js';
import type { ExecuteAgentPassOptions } from './passExecutor.js';
import {
  createThinkingController,
  emitSessionIntro,
  initializePlanManagerIfNeeded,
  normalizeHistoryCompactor,
  processAgentInputs,
  runConversationLoop,
  type PassExecutionBaseOptions,
  type PassExecutionContext,
} from './loopSupport.js';
import { extractOpenAgentToolCall, extractResponseText } from '../openai/responseUtils.js';
import { HistoryCompactor } from './historyCompactor.js';
import { AsyncQueue } from '../utils/asyncQueue.js';
import { cancel as cancelActive } from '../utils/cancellation.js';
import { AmnesiaManager, applyDementiaPolicy } from './amnesiaManager.js';
import type { ApprovalConfig } from './approvalManager.js';
import type {
  AgentInputEvent,
  AgentRuntime,
  AgentRuntimeOptions,
  ApprovalManagerFactoryConfig,
  AsyncQueueLike,
  CreateHistoryCompactorOptions,
  ExecuteAgentPassDependencies,
  HistoryCompactorLike,
  HistorySnapshot,
  RuntimeEvent,
  RuntimeEventObserver,
} from './runtimeTypes.js';
import type { PlanManagerOptions } from './planManager.js';
import { createChatMessageEntry } from './historyEntry.js';
import type { HistoryCompactorOptions } from './historyCompactor.js';
import { createRuntimeEmitter } from './runtimeEmitter.js';
import { createPayloadGuard } from './runtimePayloadGuard.js';
import {
  createPlanManagerBundle,
  createPromptCoordinatorBundle,
  createApprovalManager,
} from './runtimeCollaborators.js';
import { createMemoryPolicyController } from './runtimeMemory.js';
import { NO_HUMAN_AUTO_MESSAGE, PLAN_PENDING_REMINDER } from './runtimeSharedConstants.js';

export function createAgentRuntime({
  systemPrompt = SYSTEM_PROMPT,
  systemPromptAugmentation = '',
  getClient = getOpenAIClient,
  model = MODEL,
  runCommandFn = async (command, cwd, timeout, shell) => {
    return runCommand(command, cwd, timeout, shell);
  },
  applyFilterFn = applyFilter,
  tailLinesFn = tailLines,
  isPreapprovedCommandFn = isPreapprovedCommand,
  isSessionApprovedFn = isSessionApproved,
  approveForSessionFn = approveForSession,
  preapprovedCfg = PREAPPROVED_CFG as ApprovalConfig,
  getAutoApproveFlag = () => false,
  getNoHumanFlag = () => false,
  getPlanMergeFlag = () => false,
  getDebugFlag = () => false,
  setNoHumanFlag = () => {},
  emitAutoApproveStatus = false,
  createHistoryCompactorFn = ({
    openai: client,
    currentModel,
    logger,
  }: CreateHistoryCompactorOptions) =>
    new HistoryCompactor({
      openai: client,
      model: currentModel,
      logger: (logger ?? console) as HistoryCompactorOptions['logger'],
    }),
  dementiaLimit = 30,
  amnesiaLimit = 10,
  createAmnesiaManagerFn = (config) => new AmnesiaManager(config),
  createOutputsQueueFn = () => new AsyncQueue<RuntimeEvent>(),
  createInputsQueueFn = () => new AsyncQueue<AgentInputEvent>(),
  createPlanManagerFn,
  createEscStateFn,
  createPromptCoordinatorFn,
  createApprovalManagerFn,
  // New DI hooks
  logger = console,
  idGeneratorFn = null,
  applyDementiaPolicyFn = applyDementiaPolicy,
  createChatMessageEntryFn = createChatMessageEntry,
  executeAgentPassFn = executeAgentPass,
  createPlanAutoResponseTrackerFn,
  // Additional DI hooks
  cancelFn = cancelActive,
  planReminderMessage = PLAN_PENDING_REMINDER,
  userInputPrompt = '\n ▷ ',
  noHumanAutoMessage = NO_HUMAN_AUTO_MESSAGE,
  // New additions
  eventObservers = null as RuntimeEventObserver[] | null,
  idPrefix = 'key',
  // Dependency bag forwarded to executeAgentPass for deeper DI customization
  passExecutorDeps = null,
}: AgentRuntimeOptions = {}): AgentRuntime {
  const outputs = createOutputsQueueFn();
  if (
    !outputs ||
    typeof outputs.push !== 'function' ||
    typeof outputs.close !== 'function' ||
    typeof outputs.next !== 'function'
  ) {
    throw new TypeError('createOutputsQueueFn must return an AsyncQueue-like object.');
  }

  const outputsQueue: AsyncQueueLike<RuntimeEvent> = outputs;

  const inputs = createInputsQueueFn();
  if (
    !inputs ||
    typeof inputs.push !== 'function' ||
    typeof inputs.close !== 'function' ||
    typeof inputs.next !== 'function'
  ) {
    throw new TypeError('createInputsQueueFn must return an AsyncQueue-like object.');
  }
  const inputsQueue: AsyncQueueLike<AgentInputEvent> = inputs;
  let passCounter = 0;

  const emitter = createRuntimeEmitter({
    outputsQueue,
    eventObservers,
    logger,
    idPrefix,
    idGeneratorFn,
    isDebugEnabled: () => Boolean(typeof getDebugFlag === 'function' && getDebugFlag()),
  });
  const { emit, emitDebug } = emitter;

  const { buildGuardedRequestModelCompletion } = createPayloadGuard({ emitter });

  const nextPass = () => {
    passCounter += 1;
    emit(
      {
        type: RuntimeEventType.Pass,
        payload: {
          pass: passCounter,
          index: null,
          value: null,
        },
      },
      { id: `pass-${passCounter}` },
    );
    return passCounter;
  };

  const planManagerOptions: PlanManagerOptions = {
    emit: (event) => emit(event),
    emitStatus: (event) => emit(event),
  };

  // Collate plan manager wiring (factory + auto-response tracker) in one place.
  const { planManager, planManagerForExecutor, planAutoResponseTracker } = createPlanManagerBundle({
    emitter,
    planManagerOptions,
    getPlanMergeFlag,
    createPlanManagerFn,
    createPlanAutoResponseTrackerFn,
  });

  const normalizedPassExecutorDeps: ExecuteAgentPassDependencies =
    passExecutorDeps && typeof passExecutorDeps === 'object' ? { ...passExecutorDeps } : {};
  const guardedRequestModelCompletion = buildGuardedRequestModelCompletion(
    normalizedPassExecutorDeps.requestModelCompletionFn ?? null,
  );
  normalizedPassExecutorDeps.requestModelCompletionFn = guardedRequestModelCompletion;
  normalizedPassExecutorDeps.guardRequestPayloadSizeFn =
    guardedRequestModelCompletion.guardRequestPayloadSize;
  normalizedPassExecutorDeps.recordRequestPayloadSizeFn =
    guardedRequestModelCompletion.recordRequestPayloadBaseline;

  // Prompt coordinator + ESC controller share DI hooks, so delegate to the helper.
  const { promptCoordinator, escController } = createPromptCoordinatorBundle({
    emitter,
    emit,
    cancelFn,
    createEscStateFn,
    createPromptCoordinatorFn,
  });

  const escState = escController.state;
  const detachEscListener = escController.detach;

  let openai: ResponsesClient;
  try {
    openai = getClient();
  } catch (err) {
    emit({
      type: RuntimeEventType.Error,
      payload: {
        message: 'Failed to initialize OpenAI client. Ensure API key is configured.',
        details: err instanceof Error ? err.message : String(err),
        raw: null,
        attempts: null,
      },
    });
    outputsQueue.close();
    inputsQueue.close();
    throw err;
  }

  const approvalManagerConfig: ApprovalManagerFactoryConfig = {
    isPreapprovedCommand: isPreapprovedCommandFn,
    isSessionApproved: isSessionApprovedFn,
    approveForSession: approveForSessionFn,
    getAutoApproveFlag,
    askHuman: async (prompt) => promptCoordinator.request(prompt, { scope: 'approval' }),
    preapprovedCfg: preapprovedCfg ?? { allowlist: [] },
    logWarn: (message) =>
      emit({
        type: RuntimeEventType.Status,
        payload: {
          level: 'warn',
          message,
          details: null,
        },
      }),
    logSuccess: (message) =>
      emit({
        type: RuntimeEventType.Status,
        payload: {
          level: 'info',
          message,
          details: null,
        },
      }),
  };

  const approvalManager = createApprovalManager({
    emitter,
    createApprovalManagerFn,
    config: approvalManagerConfig,
  });

  const augmentation =
    typeof systemPromptAugmentation === 'string' ? systemPromptAugmentation.trim() : '';
  const combinedSystemPrompt = augmentation ? `${systemPrompt}\n\n${augmentation}` : systemPrompt;

  const history: HistorySnapshot = [
    createChatMessageEntryFn({
      eventType: 'chat-message',
      role: 'system',
      content: combinedSystemPrompt,
      pass: 0,
    }),
  ];

  // Memory policies mutate the shared history; keep the bookkeeping outside the loop.
  const { enforcePolicies: enforceMemoryPolicies } = createMemoryPolicyController({
    history,
    emitter,
    emitDebug,
    amnesiaLimit,
    dementiaLimit,
    createAmnesiaManagerFn,
    applyDementiaPolicyFn,
    defaultApplyDementiaPolicy: applyDementiaPolicy,
  });

  const historyCompactorCandidate: HistoryCompactor | HistoryCompactorLike | null =
    typeof createHistoryCompactorFn === 'function'
      ? createHistoryCompactorFn({
          openai: openai as unknown as HistoryCompactorOptions['openai'],
          currentModel: model,
          logger: (logger ?? console) as unknown as HistoryCompactorOptions['logger'],
        })
      : null;

  const normalizedHistoryCompactor = normalizeHistoryCompactor(historyCompactorCandidate);

  let running = false;
  let inputProcessorPromise: Promise<void> | null = null;

  async function start(): Promise<void> {
    if (running) {
      // Make start idempotent to tolerate duplicate invocations from hosts.
      return;
    }
    running = true;
    inputProcessorPromise = processAgentInputs({
      inputsQueue,
      promptCoordinator,
      emit,
    });

    await initializePlanManagerIfNeeded(planManager);

    emitSessionIntro({
      emit,
      getAutoApproveFlag,
      getNoHumanFlag,
    });

    const thinkingController = createThinkingController(emit);
    const passExecutor: typeof executeAgentPass =
      typeof executeAgentPassFn === 'function' ? executeAgentPassFn : executeAgentPass;

    const baseOptions: PassExecutionBaseOptions = {
      openai,
      model,
      history,
      emitEvent: (event, options) => emit(event, options),
      onDebug: (payload) => emitDebug(payload),
      runCommandFn,
      applyFilterFn,
      tailLinesFn,
      getNoHumanFlag,
      setNoHumanFlag,
      planReminderMessage,
      startThinkingFn: thinkingController.start,
      stopThinkingFn: thinkingController.stop,
      escState,
      approvalManager,
      historyCompactor: normalizedHistoryCompactor,
      planManager: planManagerForExecutor,
      planAutoResponseTracker,
      emitAutoApproveStatus,
      ...normalizedPassExecutorDeps,
    };

    const passContext: PassExecutionContext = {
      passExecutor,
      baseOptions,
      enforceMemoryPolicies,
      nextPass,
    };

    try {
      await runConversationLoop({
        promptCoordinator,
        getNoHumanFlag,
        noHumanAutoMessage,
        userInputPrompt,
        emit,
        history,
        createChatMessageEntryFn,
        enforceMemoryPolicies,
        passContext,
        onPassError: (error) =>
          emit({
            type: RuntimeEventType.Error,
            payload: {
              message: 'Agent loop encountered an error.',
              details: error instanceof Error ? error.message : String(error),
              raw: null,
              attempts: null,
            },
          }),
      });
    } finally {
      inputsQueue.close();
      outputsQueue.close();
      detachEscListener?.();
      if (inputProcessorPromise) {
        await inputProcessorPromise;
      }
    }
  }

  const getHistorySnapshot = (): HistorySnapshot =>
    history.map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return entry;
      }
      return { ...entry };
    });

  return {
    outputs: outputsQueue,
    inputs: inputsQueue,
    start,
    submitPrompt: (value) => inputsQueue.push({ type: 'prompt', prompt: value }),
    cancel: (payload = null) => inputsQueue.push({ type: 'cancel', payload }),
    getHistorySnapshot,
  };
}


export function createAgentLoop(options: AgentRuntimeOptions = {}): () => Promise<void> {
  const runtime = createAgentRuntime(options);
  return async function agentLoop(): Promise<void> {
    await runtime.start();
  };
}

export { extractOpenAgentToolCall, extractResponseText } from '../openai/responseUtils.js';
export {
  performHumanInputStep,
  processPromptStep,
  performResponseAndPlanSteps,
  type HumanInputStepResult,
  type HumanInputStepStatus,
  type ProcessPromptStepOptions,
  type ProcessPromptStepResult,
} from './loopSupport.js';

export default {
  createAgentLoop,
  createAgentRuntime,
  extractOpenAgentToolCall,
  extractResponseText,
};
