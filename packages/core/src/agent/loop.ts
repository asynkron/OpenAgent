/**
 * Implements the interactive agent loop that now emits structured events instead of
 * writing directly to the CLI.
 */

import { SYSTEM_PROMPT } from '../config/systemPrompt.js';
import { getOpenAIClient, MODEL } from '../openai/client.js';
import type { ResponsesClient } from '../contracts/index.js';
import { runCommand } from '../commands/run.js';
import {
  isPreapprovedCommand,
  isSessionApproved,
  approveForSession,
  PREAPPROVED_CFG,
} from '../services/commandApprovalService.js';
import { applyFilter, tailLines } from '../utils/text.js';
import { executeAgentPass } from './passExecutor.js';
import { extractOpenAgentToolCall, extractResponseText } from '../openai/responseUtils.js';
import { HistoryCompactor } from './historyCompactor.js';
import { AsyncQueue, QUEUE_DONE } from '../utils/asyncQueue.js';
import { cancel as cancelActive } from '../utils/cancellation.js';
import { AmnesiaManager, applyDementiaPolicy } from './amnesiaManager.js';
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
  preapprovedCfg = PREAPPROVED_CFG,
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
    emit({ type: 'pass', pass: passCounter });
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
      type: 'error',
      message: 'Failed to initialize OpenAI client. Ensure API key is configured.',
      details: err instanceof Error ? err.message : String(err),
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
    preapprovedCfg: preapprovedCfg as Record<string, unknown> | undefined,
    logWarn: (message) => emit({ type: 'status', level: 'warn', message }),
    logSuccess: (message) => emit({ type: 'status', level: 'info', message }),
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

  const historyCompactor: HistoryCompactor | HistoryCompactorLike | null =
    typeof createHistoryCompactorFn === 'function'
      ? createHistoryCompactorFn({
          openai: openai as unknown as HistoryCompactorOptions['openai'],
          currentModel: model,
          logger: (logger ?? console) as unknown as HistoryCompactorOptions['logger'],
        })
      : null;

  const toHistoryCompactor = (
    candidate: HistoryCompactor | HistoryCompactorLike | null,
  ): HistoryCompactor | null =>
    candidate && typeof candidate === 'object' && typeof candidate.compactIfNeeded === 'function'
      ? (candidate as HistoryCompactor)
      : null;

  const normalizedHistoryCompactor = toHistoryCompactor(historyCompactor);

  let running = false;
  let inputProcessorPromise = null;

  async function processInputEvents(): Promise<void> {
    try {
      while (true) {
        const event = await inputsQueue.next();
        if (event === QUEUE_DONE) {
          promptCoordinator.close();
          return;
        }
        if (!event || typeof event !== 'object') {
          continue;
        }
        const typedEvent = event as AgentInputEvent;
        if (typedEvent.type === 'cancel') {
          promptCoordinator.handleCancel(typedEvent.payload ?? null);
        } else if (typedEvent.type === 'prompt') {
          promptCoordinator.handlePrompt(typedEvent.prompt ?? typedEvent.value ?? '');
        }
      }
    } catch (error) {
      emit({
        type: 'error',
        message: 'Input processing terminated unexpectedly.',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function start(): Promise<void> {
    if (running) {
      throw new Error('Agent runtime already started.');
    }
    running = true;
    inputProcessorPromise = processInputEvents();

    if (planManager && typeof planManager.initialize === 'function') {
      await planManager.initialize();
    }

    emit({ type: 'banner', title: 'OpenAgent - AI Agent with JSON Protocol' });
    emit({ type: 'status', level: 'info', message: 'Submit prompts to drive the conversation.' });
    if (getAutoApproveFlag()) {
      emit({
        type: 'status',
        level: 'warn',
        message:
          'Full auto-approval mode enabled via CLI flag. All commands will run without prompting.',
      });
    }
    if (getNoHumanFlag()) {
      emit({
        type: 'status',
        level: 'warn',
        message:
          'No-human mode enabled (--nohuman). Agent will auto-respond with "continue or say \'done\'" until the AI replies "done".',
      });
    }

    const startThinkingEvent = (): void => emit({ type: 'thinking', state: 'start' });
    const stopThinkingEvent = (): void => emit({ type: 'thinking', state: 'stop' });

    try {
      while (true) {
        const noHumanActive = getNoHumanFlag();
        const userInput = noHumanActive
          ? noHumanAutoMessage
          : await promptCoordinator.request(userInputPrompt, { scope: 'user-input' });

        if (!userInput) {
          if (noHumanActive) {
            continue;
          }
          continue;
        }

        if (userInput.toLowerCase() === 'exit' || userInput.toLowerCase() === 'quit') {
          emit({ type: 'status', level: 'info', message: 'Goodbye!' });
          break;
        }

        const activePass = nextPass();

        history.push(
          createChatMessageEntryFn({
            eventType: 'chat-message',
            role: 'user',
            content: userInput,
            pass: activePass,
          }),
        );

        enforceMemoryPolicies(activePass);

        try {
          let continueLoop = true;
          let currentPass = activePass;

          while (continueLoop) {
            const shouldContinue = await (executeAgentPassFn || executeAgentPass)({
              openai,
              model,
              history,
              emitEvent: emit,
              onDebug: emitDebug,
              runCommandFn,
              applyFilterFn,
              tailLinesFn,
              getNoHumanFlag,
              setNoHumanFlag,
              planReminderMessage,
              startThinkingFn: startThinkingEvent,
              stopThinkingFn: stopThinkingEvent,
              escState,
              approvalManager,
              historyCompactor: normalizedHistoryCompactor,
              planManager: planManagerForExecutor,
              planAutoResponseTracker,
              emitAutoApproveStatus,
              passIndex: currentPass,
              ...normalizedPassExecutorDeps,
            });

            enforceMemoryPolicies(currentPass);

            if (!shouldContinue) {
              continueLoop = false;
            } else {
              currentPass = nextPass();
              continueLoop = true;
            }
          }
        } catch (error) {
          emit({
            type: 'error',
            message: 'Agent loop encountered an error.',
            details: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } finally {
      inputsQueue.close();
      outputsQueue.close();
      detachEscListener?.();
      await inputProcessorPromise;
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

export default {
  createAgentLoop,
  createAgentRuntime,
  extractOpenAgentToolCall,
  extractResponseText,
};
