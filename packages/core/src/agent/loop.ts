/**
 * Implements the interactive agent loop that now emits structured events instead of
 * writing directly to the CLI.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

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
import { extractOpenAgentToolCall, extractResponseText } from '../openai/responseUtils.js';
import { ApprovalManager } from './approvalManager.js';
import type { ApprovalManagerOptions } from './approvalManager.js';
import { HistoryCompactor } from './historyCompactor.js';
import { createEscState } from './escState.js';
import type { EscState, EscStateController } from './escState.js';
import { AsyncQueue, QUEUE_DONE } from '../utils/asyncQueue.js';
import type { AsyncQueue as AsyncQueueType } from '../utils/asyncQueue.js';
import { cancel as cancelActive } from '../utils/cancellation.js';
import { PromptCoordinator } from './promptCoordinator.js';
import type { PromptCoordinatorOptions } from './promptCoordinator.js';
import { createPlanManager } from './planManager.js';
import type { PlanManagerOptions } from './planManager.js';
import { AmnesiaManager, applyDementiaPolicy } from './amnesiaManager.js';
import type { AmnesiaManager as AmnesiaManagerType, ChatHistoryEntry as AmnesiaHistoryEntry } from './amnesiaManager.js';
import { createChatMessageEntry, mapHistoryToOpenAIMessages } from './historyEntry.js';
import type { ChatMessageEntry } from './historyEntry.js';
import { requestModelCompletion as defaultRequestModelCompletion } from './openaiRequest.js';
import type { PlanManagerLike as ExecutorPlanManagerLike } from './passExecutor/planManagerAdapter.js';
import type { HistoryCompactorOptions } from './historyCompactor.js';
import type { GuardRequestPayloadSizeFn } from './passExecutor/prePassTasks.js';

type UnknownRecord = Record<string, unknown>;

type RuntimeEvent = UnknownRecord & { type: string; __id?: string };

type RuntimeEventObserver = (event: RuntimeEvent) => void;

type GuardRequestOptions = Parameters<typeof defaultRequestModelCompletion>[0];

type GuardableRequestModelCompletion = (
  options: GuardRequestOptions,
) => ReturnType<typeof defaultRequestModelCompletion>;

type GuardedRequestModelCompletion = GuardableRequestModelCompletion & {
  guardRequestPayloadSize: GuardRequestPayloadSizeFn;
};

type AsyncQueueLike<T> = Pick<AsyncQueueType<T>, 'push' | 'close' | 'next'>;

type AgentInputEvent =
  | { type: 'prompt'; prompt?: string; value?: string }
  | { type: 'cancel'; payload?: unknown };

interface EscController {
  state: EscState;
  trigger: EscStateController['trigger'] | null;
  detach: EscStateController['detach'] | null;
}

interface PromptCoordinatorLike {
  request(prompt: string, metadata?: UnknownRecord): Promise<string>;
  handlePrompt(value: string): void;
  handleCancel(payload?: unknown): void;
  close(): void;
}

interface HistoryCompactorLike {
  compactIfNeeded?: HistoryCompactor['compactIfNeeded'];
}

interface PlanAutoResponseTracker {
  increment(): number;
  reset(): void;
  getCount(): number;
}

type IdGeneratorFn = (context: { counter: number }) => string | number | null | undefined;

type HistorySnapshot = ChatMessageEntry[];

type ExecuteAgentPassDependencies =
  Partial<
    Pick<
      ExecuteAgentPassOptions,
      | 'executeAgentCommandFn'
      | 'createObservationBuilderFn'
      | 'combineStdStreamsFn'
      | 'buildPreviewFn'
      | 'parseAssistantResponseFn'
      | 'validateAssistantResponseSchemaFn'
      | 'validateAssistantResponseFn'
      | 'createChatMessageEntryFn'
      | 'extractOpenAgentToolCallFn'
      | 'summarizeContextUsageFn'
      | 'incrementCommandCountFn'
    >
  > & {
    requestModelCompletionFn?: GuardedRequestModelCompletion;
    guardRequestPayloadSizeFn?: GuardRequestPayloadSizeFn;
  };

type PlanManagerFactoryConfig = PlanManagerOptions & {
  getPlanMergeFlag: () => boolean;
};

interface PromptCoordinatorFactoryConfig extends PromptCoordinatorOptions {
  emitEvent: (event: UnknownRecord) => void;
  escState: EscState | null;
}

interface ApprovalManagerFactoryConfig extends ApprovalManagerOptions {
  logWarn: (message: string) => void;
  logSuccess: (message: string) => void;
}

interface CreateHistoryCompactorOptions {
  openai: HistoryCompactorOptions['openai'];
  currentModel: string;
  logger?: HistoryCompactorOptions['logger'];
}

interface AgentRuntimeOptions {
  systemPrompt?: string;
  systemPromptAugmentation?: string;
  getClient?: () => ResponsesClient;
  model?: string;
  runCommandFn?: ExecuteAgentPassOptions['runCommandFn'];
  applyFilterFn?: ExecuteAgentPassOptions['applyFilterFn'];
  tailLinesFn?: ExecuteAgentPassOptions['tailLinesFn'];
  isPreapprovedCommandFn?: (command: unknown, cfg?: unknown) => boolean;
  isSessionApprovedFn?: (command: unknown) => boolean;
  approveForSessionFn?: (command: unknown) => void | Promise<void>;
  preapprovedCfg?: unknown;
  getAutoApproveFlag?: () => boolean;
  getNoHumanFlag?: () => boolean;
  getPlanMergeFlag?: () => boolean;
  getDebugFlag?: () => boolean;
  setNoHumanFlag?: (value?: boolean) => void;
  emitAutoApproveStatus?: boolean;
  createHistoryCompactorFn?: (
    options: CreateHistoryCompactorOptions,
  ) => HistoryCompactor | HistoryCompactorLike | null;
  dementiaLimit?: number;
  amnesiaLimit?: number;
  createAmnesiaManagerFn?: (options: { threshold: number }) => AmnesiaManagerType;
  createOutputsQueueFn?: () => AsyncQueueLike<RuntimeEvent>;
  createInputsQueueFn?: () => AsyncQueueLike<AgentInputEvent>;
  createPlanManagerFn?: (config: PlanManagerFactoryConfig) => ReturnType<typeof createPlanManager>;
  createEscStateFn?: () => EscStateController;
  createPromptCoordinatorFn?: (config: PromptCoordinatorFactoryConfig) => PromptCoordinatorLike;
  createApprovalManagerFn?: (config: ApprovalManagerFactoryConfig) => ApprovalManager;
  logger?: Console | null;
  idGeneratorFn?: IdGeneratorFn | null;
  applyDementiaPolicyFn?: typeof applyDementiaPolicy;
  createChatMessageEntryFn?: typeof createChatMessageEntry;
  executeAgentPassFn?: typeof executeAgentPass;
  createPlanAutoResponseTrackerFn?: () => PlanAutoResponseTracker | null;
  cancelFn?: (reason?: unknown) => void;
  planReminderMessage?: string;
  userInputPrompt?: string;
  noHumanAutoMessage?: string;
  eventObservers?: RuntimeEventObserver[] | null;
  idPrefix?: string;
  passExecutorDeps?: ExecuteAgentPassDependencies | null;
}

export interface AgentRuntime {
  readonly outputs: AsyncQueueLike<RuntimeEvent>;
  readonly inputs: AsyncQueueLike<AgentInputEvent>;
  start(): Promise<void>;
  submitPrompt(value: string): void;
  cancel(payload?: unknown): void;
  getHistorySnapshot(): HistorySnapshot;
}

const NO_HUMAN_AUTO_MESSAGE = "continue or say 'done'";
const PLAN_PENDING_REMINDER =
  'The plan is not completed, either send a command to continue, update the plan, take a deep breath and reanalyze the situation, add/remove steps or sub-steps, or abandon the plan if we don´t know how to continue';

// Guardrail used to detect runaway payload growth between consecutive model calls.
const MAX_REQUEST_GROWTH_FACTOR = 5;

export function createAgentRuntime({
  systemPrompt = SYSTEM_PROMPT,
  systemPromptAugmentation = '',
  getClient = getOpenAIClient,
  model = MODEL,
  runCommandFn = async (command, cwd, timeout, shell) => {
    const result = await runCommand(command, cwd, timeout, shell);
    return result as unknown as Record<string, unknown>;
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
  createHistoryCompactorFn = ({ openai: client, currentModel, logger }: CreateHistoryCompactorOptions) =>
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
  createPlanManagerFn = (config) => createPlanManager(config),
  createEscStateFn = () => createEscState(),
  createPromptCoordinatorFn = (config) => new PromptCoordinator(config),
  createApprovalManagerFn = (config) => new ApprovalManager(config),
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
  eventObservers = null,
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
  let counter = 0;
  let passCounter = 0;
  let previousRequestPayloadSize: number | null = null;

  type LoggerLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

  const logWithFallback = (level: LoggerLevel, message: string, details: unknown = null): void => {
    const sink = logger ?? console;
    const fn = sink && typeof sink[level] === 'function' ? sink[level].bind(sink) : null;
    if (fn) {
      fn(message, details);
    } else if (sink && typeof sink.log === 'function') {
      sink.log(message, details);
    }
  };

  const historyDumpDirectory = join(process.cwd(), '.openagent', 'failsafe-history');

  interface DumpHistorySnapshotInput {
    historyEntries?: HistorySnapshot | unknown[];
    passIndex?: number | null;
  }

  const dumpHistorySnapshot = async ({
    historyEntries = [],
    passIndex,
  }: DumpHistorySnapshotInput): Promise<string> => {
    await mkdir(historyDumpDirectory, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const prefix = Number.isFinite(passIndex) ? `pass-${passIndex}-` : 'pass-unknown-';
    const filePath = join(historyDumpDirectory, `${prefix}${timestamp}.json`);
    await writeFile(filePath, JSON.stringify(historyEntries, null, 2), 'utf8');
    return filePath;
  };

  const estimateRequestPayloadSize = (historySnapshot: unknown, modelName: unknown): number | null => {
    try {
      const payload = {
        model: modelName,
        input: mapHistoryToOpenAIMessages(historySnapshot),
        tool_choice: { type: 'function', name: 'open-agent' },
      };
      const serialized = JSON.stringify(payload);
      return typeof serialized === 'string' ? Buffer.byteLength(serialized, 'utf8') : null;
    } catch (error) {
      logWithFallback('warn', '[failsafe] Unable to estimate OpenAI payload size before request.', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  };

  const buildGuardedRequestModelCompletion = (
    delegate: GuardableRequestModelCompletion | null | undefined,
  ): GuardedRequestModelCompletion => {
    const requestFn: GuardableRequestModelCompletion =
      typeof delegate === 'function' ? delegate : defaultRequestModelCompletion;

    const guardRequestPayloadSize: GuardRequestPayloadSizeFn = async (options) => {
      const payloadSize = estimateRequestPayloadSize(options?.history, options?.model);
      if (Number.isFinite(previousRequestPayloadSize) && Number.isFinite(payloadSize)) {
        const previous = previousRequestPayloadSize as number;
        const current = payloadSize as number;
        const growthFactor = current / previous;
        // Only treat this as runaway growth if the payload both jumps by ~5x and
        // adds at least 1 KiB of new content—this avoids tripping on tiny histories.
        if (growthFactor >= MAX_REQUEST_GROWTH_FACTOR && current - previous > 1024) {
          logWithFallback(
            'error',
            `[failsafe] OpenAI request ballooned from ${previous}B to ${current}B on pass ${options?.passIndex ?? 'unknown'}.`,
          );
          try {
            const dumpPath = await dumpHistorySnapshot({
              historyEntries: Array.isArray(options?.history) ? options.history : [],
              passIndex: options?.passIndex,
            });
            if (dumpPath) {
              logWithFallback('error', `[failsafe] Dumped history snapshot to ${dumpPath}.`);
            }
          } catch (dumpError) {
            logWithFallback('error', '[failsafe] Failed to persist history snapshot.', {
              error: dumpError instanceof Error ? dumpError.message : String(dumpError),
            });
          }
          logWithFallback('error', '[failsafe] Exiting to prevent excessive API charges.');
          process.exit(1);
        }
      }

      if (Number.isFinite(payloadSize)) {
        previousRequestPayloadSize = payloadSize as number;
      }

    };

    const guardedRequest = Object.assign(
      async (options: GuardRequestOptions) => {
        await guardRequestPayloadSize(options);
        return requestFn(options);
      },
      { guardRequestPayloadSize },
    );

    return guardedRequest;
  };
  const nextId = (): string => {
    try {
      if (typeof idGeneratorFn === 'function') {
        const id = idGeneratorFn({ counter });
        if (id) return String(id);
      }
    } catch (_error) {
      // ignore and fall back
    }
    return idPrefix + counter++;
  };

  const emit = (event: unknown): void => {
    if (!event || typeof event !== 'object') {
      throw new TypeError('Agent emit expected event to be an object.');
    }
    // Hard requirement: stringify, deserialize, emit — always deep clone via JSON serialization.
    const clonedEvent = JSON.parse(JSON.stringify(event)) as RuntimeEvent;
    clonedEvent.__id = nextId();
    outputsQueue.push(clonedEvent);
    if (Array.isArray(eventObservers)) {
      for (const obs of eventObservers) {
        if (typeof obs !== 'function') continue;
        try {
          obs(clonedEvent);
        } catch (_error) {
          outputsQueue.push({ type: 'status', level: 'warn', message: 'eventObservers item threw.' });
        }
      }
    }
  };

  const emitFactoryWarning = (message: string, error: unknown = null): void => {
    const warning: UnknownRecord = { type: 'status', level: 'warn', message };
    if (error != null) {
      warning.details = error instanceof Error ? error.message : String(error);
    }
    emit(warning);
  };

  const initializeWithFactory = <T, C>({
    factory,
    fallback,
    config,
    warnMessage,
    onInvalid,
    validate,
  }: {
    factory?: ((configuration: C) => T) | null;
    fallback: (configuration: C) => T;
    config: C;
    warnMessage?: string;
    onInvalid?: (candidate: unknown) => void;
    validate?: (candidate: unknown) => candidate is T;
  }): T => {
    if (typeof factory === 'function') {
      try {
        const candidate = factory(config);
        const validator =
          typeof validate === 'function'
            ? validate
            : (value: unknown): value is T => Boolean(value && typeof value === 'object');
        if (validator(candidate)) {
          return candidate;
        }
        if (typeof onInvalid === 'function') {
          onInvalid(candidate);
        }
      } catch (error) {
        if (warnMessage) {
          emitFactoryWarning(warnMessage, error);
        }
        return fallback(config);
      }
    }
    return fallback(config);
  };

  const nextPass = () => {
    passCounter += 1;
    emit({ type: 'pass', pass: passCounter });
    return passCounter;
  };

  const planManagerOptions: PlanManagerOptions = {
    emit: (event) => emit(event),
    emitStatus: (event) => emit(event),
  };

  const planManagerConfig: PlanManagerFactoryConfig = {
    ...planManagerOptions,
    getPlanMergeFlag,
  };

  const planManager = initializeWithFactory<ReturnType<typeof createPlanManager> | null, PlanManagerFactoryConfig>({
    factory: createPlanManagerFn,
    fallback: () => createPlanManager(planManagerOptions),
    config: planManagerConfig,
    warnMessage: 'Failed to initialize plan manager via factory.',
    onInvalid: (candidate) =>
      emitFactoryWarning(
        'Plan manager factory returned an invalid value.',
        candidate == null ? String(candidate) : `typeof candidate === ${typeof candidate}`,
      ),
  });

  // Track how many consecutive plan reminders we have injected so that the
  // agent eventually defers to a human if progress stalls.
  const defaultPlanAutoResponseTracker = (): PlanAutoResponseTracker => {
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

  const maybeTracker: PlanAutoResponseTracker | null =
    typeof createPlanAutoResponseTrackerFn === 'function'
      ? createPlanAutoResponseTrackerFn() ?? null
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

  const normalizedPassExecutorDeps: ExecuteAgentPassDependencies =
    passExecutorDeps && typeof passExecutorDeps === 'object' ? { ...passExecutorDeps } : {};
  const guardedRequestModelCompletion = buildGuardedRequestModelCompletion(
    normalizedPassExecutorDeps.requestModelCompletionFn ?? null,
  );
  normalizedPassExecutorDeps.requestModelCompletionFn = guardedRequestModelCompletion;
  normalizedPassExecutorDeps.guardRequestPayloadSizeFn =
    guardedRequestModelCompletion.guardRequestPayloadSize;

  const fallbackEscController: EscStateController = createEscState();
  let escController: EscController = {
    state: fallbackEscController.state,
    trigger: fallbackEscController.trigger ?? null,
    detach: fallbackEscController.detach ?? null,
  };

  try {
    const candidate = createEscStateFn();
    if (candidate && typeof candidate === 'object') {
      escController = {
        state: candidate.state ?? fallbackEscController.state,
        trigger:
          typeof candidate.trigger === 'function'
            ? candidate.trigger
            : fallbackEscController.trigger ?? null,
        detach:
          typeof candidate.detach === 'function'
            ? candidate.detach
            : fallbackEscController.detach ?? null,
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

  const escState = escController.state;
  const triggerEsc = escController.trigger;
  const detachEscListener = escController.detach;

  const promptCoordinatorConfig: PromptCoordinatorFactoryConfig = {
    emitEvent: (event: UnknownRecord) => emit(event),
    escState: { ...escState, trigger: triggerEsc ?? escState.trigger },
    cancelFn,
  };

  const promptCoordinator = initializeWithFactory<PromptCoordinatorLike, PromptCoordinatorFactoryConfig>({
    factory: createPromptCoordinatorFn,
    fallback: () => new PromptCoordinator(promptCoordinatorConfig),
    config: promptCoordinatorConfig,
    warnMessage: 'Failed to initialize prompt coordinator via factory.',
    onInvalid: (candidate) =>
      emitFactoryWarning(
        'Prompt coordinator factory returned an invalid value.',
        candidate == null ? String(candidate) : `typeof candidate === ${typeof candidate}`,
      ),
  });

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

  const approvalManager = initializeWithFactory<ApprovalManager | null, ApprovalManagerFactoryConfig>({
    factory: createApprovalManagerFn,
    fallback: () => new ApprovalManager(approvalManagerConfig),
    config: approvalManagerConfig,
    warnMessage: 'Failed to initialize approval manager via factory.',
    onInvalid: (candidate) =>
      emitFactoryWarning(
        'Approval manager factory returned an invalid value.',
        candidate == null ? String(candidate) : `typeof candidate === ${typeof candidate}`,
      ),
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

  const normalizedAmnesiaLimit =
    typeof amnesiaLimit === 'number' && Number.isFinite(amnesiaLimit) && amnesiaLimit > 0
      ? Math.floor(amnesiaLimit)
      : 0;

  let amnesiaManager: AmnesiaManagerType | null = null;
  if (normalizedAmnesiaLimit > 0 && typeof createAmnesiaManagerFn === 'function') {
    try {
      amnesiaManager = createAmnesiaManagerFn({ threshold: normalizedAmnesiaLimit });
    } catch (error) {
      emit({
        type: 'status',
        level: 'warn',
        message: '[memory] Failed to initialize amnesia manager.',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const normalizedDementiaLimit =
    typeof dementiaLimit === 'number' && Number.isFinite(dementiaLimit) && dementiaLimit > 0
      ? Math.floor(dementiaLimit)
      : 0;

  const historyCompactor: HistoryCompactor | HistoryCompactorLike | null =
    typeof createHistoryCompactorFn === 'function'
      ? createHistoryCompactorFn({
          openai: (openai as unknown) as HistoryCompactorOptions['openai'],
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

  const isDebugEnabled = (): boolean => Boolean(typeof getDebugFlag === 'function' && getDebugFlag());

  const emitDebug = (payloadOrFactory: unknown): void => {
    if (!isDebugEnabled()) {
      return;
    }

    let payload: unknown;
    try {
      payload = typeof payloadOrFactory === 'function' ? payloadOrFactory() : payloadOrFactory;
    } catch (error) {
      emit({
        type: 'status',
        level: 'warn',
        message: 'Failed to prepare debug payload.',
        details: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    if (typeof payload === 'undefined') {
      return;
    }

    emit({ type: 'debug', payload });
  };

  const enforceMemoryPolicies = (currentPass: number): void => {
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
        emit({
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
          (applyDementiaPolicyFn || applyDementiaPolicy)({
            history: history as unknown as AmnesiaHistoryEntry[],
            currentPass,
            limit: normalizedDementiaLimit,
          }) || mutated;
      } catch (error) {
        emit({
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
