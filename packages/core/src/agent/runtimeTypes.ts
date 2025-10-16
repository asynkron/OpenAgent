import type { ResponsesClient } from '../openai/responses.js';
import type { HistoryCompactor, HistoryCompactorOptions } from './historyCompactor.js';
import type {
  GuardRequestPayloadSizeFn,
  RecordRequestPayloadSizeFn,
} from './passExecutor/types.js';
import type { ExecuteAgentPassOptions } from './passExecutor.js';
import type { createPlanManager, PlanManagerOptions } from './planManager.js';
import type {
  PromptCoordinatorOptions,
  PromptCoordinatorEvent,
  PromptRequestMetadata,
} from './promptCoordinator.js';
import type { ApprovalManager, ApprovalManagerOptions } from './approvalManager.js';
import type { EscState, EscStateController } from './escState.js';
import type { AsyncQueue as AsyncQueueType } from '../utils/asyncQueue.js';
import type { ChatMessageEntry } from './historyEntry.js';
import type { AmnesiaManager as AmnesiaManagerType } from './amnesiaManager.js';

export type UnknownRecord = Record<string, unknown>;

export type RuntimeEvent = UnknownRecord & { type: string; __id?: string };

export type RuntimeEventObserver = (event: RuntimeEvent) => void;

export type GuardRequestOptions = Parameters<
  NonNullable<ExecuteAgentPassOptions['requestModelCompletionFn']>
>[0];

export type GuardableRequestModelCompletion = NonNullable<
  ExecuteAgentPassOptions['requestModelCompletionFn']
>;

export type GuardedRequestModelCompletion = GuardableRequestModelCompletion & {
  guardRequestPayloadSize: GuardRequestPayloadSizeFn;
  recordRequestPayloadBaseline: RecordRequestPayloadSizeFn;
};

export type AsyncQueueLike<T> = Pick<AsyncQueueType<T>, 'push' | 'close' | 'next'>;

export type AgentInputEvent =
  | { type: 'prompt'; prompt?: string; value?: string }
  | { type: 'cancel'; payload?: unknown };

export interface EscController {
  state: EscState;
  trigger: EscStateController['trigger'] | null;
  detach: EscStateController['detach'] | null;
}

export interface PromptCoordinatorLike {
  request(prompt: string, metadata?: PromptRequestMetadata): Promise<string>;
  handlePrompt(value: string): void;
  handleCancel(payload?: unknown): void;
  close(): void;
}

export interface HistoryCompactorLike {
  compactIfNeeded?: HistoryCompactor['compactIfNeeded'];
}

export interface PlanAutoResponseTracker {
  increment(): number;
  reset(): void;
  getCount(): number;
}

export type IdGeneratorFn = (context: { counter: number }) => string | number | null | undefined;

export type HistorySnapshot = ChatMessageEntry[];

export type ExecuteAgentPassDependencies = Partial<
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
  recordRequestPayloadSizeFn?: RecordRequestPayloadSizeFn;
};

export type PlanManagerFactoryConfig = PlanManagerOptions & {
  getPlanMergeFlag: () => boolean;
};

export interface PromptCoordinatorFactoryConfig extends PromptCoordinatorOptions {
  emitEvent: (event: PromptCoordinatorEvent) => void;
  escState: EscState | null;
}

export interface ApprovalManagerFactoryConfig extends ApprovalManagerOptions {
  logWarn: (message: string) => void;
  logSuccess: (message: string) => void;
}

export interface CreateHistoryCompactorOptions {
  openai: HistoryCompactorOptions['openai'];
  currentModel: string;
  logger?: HistoryCompactorOptions['logger'];
}

export interface AgentRuntimeOptions {
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
  applyDementiaPolicyFn?: (typeof import('./amnesiaManager.js'))['applyDementiaPolicy'];
  createChatMessageEntryFn?: (typeof import('./historyEntry.js'))['createChatMessageEntry'];
  executeAgentPassFn?: (typeof import('./passExecutor.js'))['executeAgentPass'];
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

export interface RuntimeLogger {
  logWithFallback(
    level: 'log' | 'info' | 'warn' | 'error' | 'debug',
    message: string,
    details?: unknown,
  ): void;
}

export interface RuntimeEmitter extends RuntimeLogger {
  emit(event: unknown): void;
  emitFactoryWarning(message: string, error?: unknown): void;
  emitDebug(payloadOrFactory: unknown): void;
}
