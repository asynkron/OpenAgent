import type { ResponsesClient } from '../openai/responses.js';
import type { CommandDraft } from '../contracts/index.js';
import type { HistoryCompactor, HistoryCompactorOptions } from './historyCompactor.js';
import type {
  GuardRequestPayloadSizeFn,
  RecordRequestPayloadSizeFn,
} from './passExecutor/types.js';
import type { ExecuteAgentPassOptions } from './passExecutor.js';
import type { createPlanManager, PlanManagerOptions } from './planManager.js';
import type { PromptCoordinatorOptions, PromptRequestMetadata } from './promptCoordinator.js';
import type { ApprovalManager, ApprovalManagerOptions, ApprovalConfig } from './approvalManager.js';
import type { EscPayload, EscState, EscStateController } from './escState.js';
import type { AsyncQueue as AsyncQueueType } from '../utils/asyncQueue.js';
import type { ChatMessageEntry } from './historyEntry.js';
import type { AmnesiaManager as AmnesiaManagerType } from './amnesiaManager.js';
import type {
  AssistantMessageRuntimeEvent,
  BannerRuntimeEvent,
  CommandResultRuntimeEvent,
  ContextUsageRuntimeEvent,
  DebugRuntimeEvent,
  DebugRuntimeEventPayload,
  ErrorRuntimeEvent,
  PassRuntimeEvent,
  PlanProgressRuntimeEvent,
  PlanRuntimeEvent,
  RequestInputRuntimeEvent,
  RuntimeEvent,
  RuntimeEventBase,
  RuntimeEventObserver,
  SchemaValidationFailedRuntimeEvent,
  StatusLevel,
  StatusRuntimeEvent,
  ThinkingRuntimeEvent,
  ThinkingState,
} from './runtimeEvents.js';

export type {
  AssistantMessageRuntimeEvent,
  BannerRuntimeEvent,
  CommandResultRuntimeEvent,
  ContextUsageRuntimeEvent,
  DebugRuntimeEvent,
  DebugRuntimeEventPayload,
  ErrorRuntimeEvent,
  PassRuntimeEvent,
  PlanProgressRuntimeEvent,
  PlanRuntimeEvent,
  RequestInputRuntimeEvent,
  RuntimeEvent,
  RuntimeEventBase,
  RuntimeEventObserver,
  SchemaValidationFailedRuntimeEvent,
  StatusLevel,
  StatusRuntimeEvent,
  ThinkingRuntimeEvent,
  ThinkingState,
} from './runtimeEvents.js';

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

export interface AgentPromptInputEvent {
  type: 'prompt';
  prompt?: string | null;
  value?: string | null;
}

export interface AgentCancelInputEvent {
  type: 'cancel';
  payload?: EscPayload;
}

export type AgentInputEvent = AgentPromptInputEvent | AgentCancelInputEvent;

export interface EscController {
  state: EscState;
  trigger: EscStateController['trigger'] | null;
  detach: EscStateController['detach'] | null;
}

export interface PromptCoordinatorLike {
  request(prompt: string, metadata?: PromptRequestMetadata | null): Promise<string>;
  handlePrompt(value: string): void;
  handleCancel(payload?: EscPayload): void;
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
  emitEvent: (event: RuntimeEvent) => void;
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
  isPreapprovedCommandFn?: (command: CommandDraft, cfg: ApprovalConfig) => boolean;
  isSessionApprovedFn?: (command: CommandDraft) => boolean;
  approveForSessionFn?: (command: CommandDraft) => void | Promise<void>;
  preapprovedCfg?: ApprovalConfig | null;
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
  cancelFn?: (reason?: EscPayload) => void;
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
  cancel(payload?: EscPayload): void;
  getHistorySnapshot(): HistorySnapshot;
}

export interface RuntimeLogger {
  logWithFallback(
    level: 'log' | 'info' | 'warn' | 'error' | 'debug',
    message: string,
    details?: string | null,
  ): void;
}

export type RuntimeDebugPayload =
  | DebugRuntimeEventPayload
  | (() => DebugRuntimeEventPayload | null | undefined);

export interface RuntimeEmitter extends RuntimeLogger {
  emit(event: RuntimeEvent): void;
  emitFactoryWarning(message: string, error?: string | null): void;
  emitDebug(payloadOrFactory: RuntimeDebugPayload): void;
}
