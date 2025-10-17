import type { ResponsesClient } from '../../openai/responses.js';
import type { ObservationBuilderDeps } from '../observationBuilder.js';
import type ObservationBuilder from '../observationBuilder.js';
import type { EscState } from '../escState.js';
import type { ApprovalManager } from '../approvalManager.js';
import type { HistoryCompactor } from '../historyCompactor.js';
import type { AgentCommandContext, CommandExecutionResult } from '../commandExecution.js';
import type { PlanStep } from './planExecution.js';
import type { ToolResponse } from '../../contracts/index.js';
import type { ChatMessageEntry } from '../historyEntry.js';
import type { requestModelCompletion as RequestModelCompletion } from '../modelRequest.js';
import type { executeAgentCommand as ExecuteAgentCommand } from '../commandExecution.js';
import type { parseAssistantResponse as ParseAssistantResponse } from '../responseParser.js';
import type { RuntimeProperty, RuntimeEvent } from '../runtimeTypes.js';
import type {
  validateAssistantResponseSchema as ValidateAssistantResponseSchema,
  validateAssistantResponse as ValidateAssistantResponse,
} from '../responseValidator.js';
import type { createChatMessageEntry as CreateChatMessageEntry } from '../historyEntry.js';
import type { extractOpenAgentToolCall as ExtractOpenAgentToolCall } from '../../openai/responseUtils.js';
import type { summarizeContextUsage as SummarizeContextUsage } from '../../utils/contextUsage.js';
import type { incrementCommandCount as IncrementCommandCount } from '../../services/commandStatsService.js';
import type { PlanManagerLike } from './planManagerAdapter.js';
import type { PlanAutoResponseTracker } from './planReminderController.js';

export type EmitEvent = (event: RuntimeEvent) => void;

export interface GuardRequestPayloadSizeInput {
  history: PlanHistory;
  model: string;
  passIndex: number;
}

export type GuardRequestPayloadSizeFn =
  | ((options: GuardRequestPayloadSizeInput) => Promise<void>)
  | null
  | undefined;

export type RecordRequestPayloadSizeFn =
  | ((options: GuardRequestPayloadSizeInput) => Promise<void>)
  | null
  | undefined;

export type CompletionAttempt =
  | { status: 'canceled' }
  | { status: 'missing-content' }
  | { status: 'success'; responseContent: string };

export type CommandRunOutcome = CommandExecutionResult;

export interface DebugMetadata {
  stage: string;
  [key: string]: RuntimeProperty;
}

export interface ExecuteAgentPassOptions {
  openai: ResponsesClient;
  model: string;
  history: PlanHistory;
  emitEvent?: EmitEvent;
  onDebug?: ((payload: DebugMetadata) => void) | null;
  runCommandFn: AgentCommandContext['runCommandFn'];
  applyFilterFn: ObservationBuilderDeps['applyFilter'];
  tailLinesFn: ObservationBuilderDeps['tailLines'];
  getNoHumanFlag?: () => boolean;
  setNoHumanFlag?: (value: boolean) => void;
  planReminderMessage: string;
  startThinkingFn: () => void;
  stopThinkingFn: () => void;
  escState: EscState | null;
  approvalManager: ApprovalManager | null;
  historyCompactor: HistoryCompactor | null;
  planManager: PlanManagerLike | null;
  emitAutoApproveStatus?: boolean;
  planAutoResponseTracker?: PlanAutoResponseTracker | null;
  passIndex: number;
  requestModelCompletionFn?: typeof RequestModelCompletion;
  executeAgentCommandFn?: typeof ExecuteAgentCommand;
  createObservationBuilderFn?: (deps: ObservationBuilderDeps) => ObservationBuilder;
  combineStdStreamsFn?: ObservationBuilderDeps['combineStdStreams'];
  buildPreviewFn?: ObservationBuilderDeps['buildPreview'];
  parseAssistantResponseFn?: typeof ParseAssistantResponse;
  validateAssistantResponseSchemaFn?: typeof ValidateAssistantResponseSchema;
  validateAssistantResponseFn?: typeof ValidateAssistantResponse;
  createChatMessageEntryFn?: typeof CreateChatMessageEntry;
  extractOpenAgentToolCallFn?: typeof ExtractOpenAgentToolCall;
  summarizeContextUsageFn?: typeof SummarizeContextUsage;
  incrementCommandCountFn?: typeof IncrementCommandCount;
  guardRequestPayloadSizeFn?: GuardRequestPayloadSizeFn;
  recordRequestPayloadSizeFn?: RecordRequestPayloadSizeFn;
}

export interface NormalizedExecuteAgentPassOptions extends ExecuteAgentPassOptions {
  emitEvent: EmitEvent;
  requestModelCompletionFn: typeof RequestModelCompletion;
  executeAgentCommandFn: typeof ExecuteAgentCommand;
  parseAssistantResponseFn: typeof ParseAssistantResponse;
  validateAssistantResponseSchemaFn: typeof ValidateAssistantResponseSchema;
  validateAssistantResponseFn: typeof ValidateAssistantResponse;
  createChatMessageEntryFn: typeof CreateChatMessageEntry;
  extractOpenAgentToolCallFn: typeof ExtractOpenAgentToolCall;
  summarizeContextUsageFn: typeof SummarizeContextUsage;
  incrementCommandCountFn: typeof IncrementCommandCount;
  createObservationBuilderFn: (deps: ObservationBuilderDeps) => ObservationBuilder;
  combineStdStreamsFn: ObservationBuilderDeps['combineStdStreams'];
  buildPreviewFn: ObservationBuilderDeps['buildPreview'];
}

export type PlanHistory = ChatMessageEntry[];

export interface AssistantResponseSuccess {
  status: 'success';
  parsed: ToolResponse;
  responseContent: string;
}

export interface AssistantResponseFailure {
  status: 'retry';
}

export type AssistantResponseResolution = AssistantResponseSuccess | AssistantResponseFailure;
