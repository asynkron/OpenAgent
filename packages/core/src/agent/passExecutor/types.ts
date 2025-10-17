import type {
  ResponsesClient,
  ToolCall,
  ToolResponse,
  ToolResponseStreamPartial,
} from '../../contracts/index.js';
import type {
  ObservationBuilderDeps,
  ObservationRenderPayload,
} from '../observationBuilder.js';
import type ObservationBuilder from '../observationBuilder.js';
import type { EscState } from '../escState.js';
import type { ApprovalManager } from '../approvalManager.js';
import type { HistoryCompactor } from '../historyCompactor.js';
import type { AgentCommandContext, CommandExecutionResult } from '../commandExecution.js';
import type { PlanStep } from './planExecution.js';
import type { ChatMessageEntry } from '../historyEntry.js';
import type { requestModelCompletion as RequestModelCompletion } from '../modelRequest.js';
import type { executeAgentCommand as ExecuteAgentCommand } from '../commandExecution.js';
import type {
  parseAssistantResponse as ParseAssistantResponse,
  AssistantPayload,
} from '../responseParser.js';
import type {
  validateAssistantResponseSchema as ValidateAssistantResponseSchema,
  validateAssistantResponse as ValidateAssistantResponse,
  SchemaValidationResult,
  AssistantResponseValidationResult,
} from '../responseValidator.js';
import type { createChatMessageEntry as CreateChatMessageEntry } from '../historyEntry.js';
import type { extractOpenAgentToolCall as ExtractOpenAgentToolCall } from '../../openai/responseUtils.js';
import type {
  summarizeContextUsage as SummarizeContextUsage,
  ContextUsageSummary,
} from '../../utils/contextUsage.js';
import type { incrementCommandCount as IncrementCommandCount } from '../../services/commandStatsService.js';
import type { PlanManagerLike } from './planManagerAdapter.js';
import type { PlanAutoResponseTracker } from './planReminderController.js';
import type { ObservationParseAttempt, ObservationRecord } from '../historyMessageBuilder.js';

type StructuredStreamAction = 'replace' | 'remove';

export interface AgentRuntimeStatusEvent {
  type: 'status';
  level: 'info' | 'warn' | 'error';
  message: string;
  details?: string;
  __id?: string;
}

export interface AgentRuntimeContextUsageEvent {
  type: 'context-usage';
  usage: ContextUsageSummary;
  __id?: string;
}

export interface AgentRuntimeErrorEvent {
  type: 'error';
  message: string;
  details?: string;
  raw?: string;
  attempts?: ObservationParseAttempt[];
  __id?: string;
}

export interface AgentRuntimeSchemaValidationFailedEvent {
  type: 'schema_validation_failed';
  message: string;
  errors: SchemaValidationResult['errors'];
  raw: string;
  __id?: string;
}

export interface AgentRuntimeAssistantMessageEvent {
  type: 'assistant-message';
  message: string;
  __id?: string;
}

export interface AgentRuntimeCommandResultEvent {
  type: 'command-result';
  command: AgentCommandContext['command'];
  result: CommandExecutionResult['result'];
  preview: ObservationRenderPayload;
  execution: CommandExecutionResult['executionDetails'];
  planStep: PlanStep | null;
  __id?: string;
}

export interface AgentRuntimePlanEvent {
  type: 'plan';
  plan: PlanStep[];
  __id?: string;
}

export interface AgentRuntimeStructuredDebugEvent {
  type: 'debug';
  id: string;
  payload:
    | {
        __openagentStreamAction: Extract<StructuredStreamAction, 'remove'>;
      }
    | {
        __openagentStreamAction: Extract<StructuredStreamAction, 'replace'>;
        __openagentStreamValue: ToolResponseStreamPartial | undefined;
      };
  __id?: string;
}

export type AgentRuntimeEvent =
  | AgentRuntimeStatusEvent
  | AgentRuntimeContextUsageEvent
  | AgentRuntimeErrorEvent
  | AgentRuntimeSchemaValidationFailedEvent
  | AgentRuntimeAssistantMessageEvent
  | AgentRuntimeCommandResultEvent
  | AgentRuntimePlanEvent
  | AgentRuntimeStructuredDebugEvent;

export type EmitEvent = (event: AgentRuntimeEvent) => void;

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

export type DebugPayload =
  | {
      stage: 'openai-response';
      toolCall: ToolCall | null;
    }
  | {
      stage: 'assistant-response-schema-validation-error';
      message: string;
      errors: SchemaValidationResult['errors'];
      raw: string;
    }
  | {
      stage: 'assistant-response-validation-error';
      message: string;
      details: string;
      errors: AssistantResponseValidationResult['errors'];
      raw: string;
    }
  | {
      stage: 'assistant-response';
      parsed: AssistantPayload;
    }
  | {
      stage: 'command-execution';
      command: AgentCommandContext['command'];
      result: CommandExecutionResult['result'];
      execution: CommandExecutionResult['executionDetails'];
      observation: ObservationRecord;
    }
  | {
      stage: 'debug-payload-error';
      message: string;
    };

export interface ExecuteAgentPassOptions {
  openai: ResponsesClient;
  model: string;
  history: PlanHistory;
  emitEvent?: EmitEvent;
  onDebug?: ((payload: DebugPayload) => void) | null;
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
