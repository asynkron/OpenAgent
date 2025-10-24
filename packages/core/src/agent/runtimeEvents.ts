import type { PromptRequestMetadata } from './promptCoordinator.js';
import type { PlanProgress, PlanSnapshot, PlanSnapshotStep } from '../utils/plan.js';
import type { ContextUsageSummary } from '../utils/contextUsage.js';
import type {
  CommandDraft,
  CommandExecutionDetails,
  PlanResponse,
} from '../contracts/index.js';
import type { CommandResult } from '../commands/run.js';
import type {
  ObservationPayload,
  ObservationRenderPayload,
} from './observationBuilder.js';
import type { ObservationParseAttempt } from './historyMessageBuilder.js';
import type { OpenAgentToolCall } from '../openai/responseUtils.js';
import type { SchemaValidationError } from './responseValidation/types.js';
import type { PlanHistorySnapshot } from './passExecutor/planSnapshot.js';
import type { PlanResponseStreamPartial } from '../openai/responses.js';

export interface RuntimeEventBase<Type extends string, Payload> {
  readonly type: Type;
  readonly payload: Payload;
  readonly __id?: string;
  readonly agent?: string;
}

export interface BannerRuntimeEventPayload {
  readonly title: string | null;
  readonly subtitle: string | null;
}

export type BannerRuntimeEvent = RuntimeEventBase<'banner', BannerRuntimeEventPayload>;

export type StatusLevel = 'info' | 'warn' | 'error';

export interface StatusRuntimeEventPayload {
  readonly level: StatusLevel;
  readonly message: string;
  readonly details: string | null;
}

export type StatusRuntimeEvent = RuntimeEventBase<'status', StatusRuntimeEventPayload>;

export interface PassRuntimeEventPayload {
  readonly pass: number;
  readonly index: number | null;
  readonly value: number | null;
}

export type PassRuntimeEvent = RuntimeEventBase<'pass', PassRuntimeEventPayload>;

export type ThinkingState = 'start' | 'stop';

export interface ThinkingRuntimeEventPayload {
  readonly state: ThinkingState;
}

export type ThinkingRuntimeEvent = RuntimeEventBase<'thinking', ThinkingRuntimeEventPayload>;

export interface AssistantMessageRuntimeEventPayload {
  readonly message: string;
}

export type AssistantMessageRuntimeEvent = RuntimeEventBase<
  'assistant-message',
  AssistantMessageRuntimeEventPayload
>;

export type PlanningState = 'start' | 'update' | 'finish';

export interface PlanningRuntimeEventPayload {
  readonly state: PlanningState;
}

export type PlanningRuntimeEvent = RuntimeEventBase<'planning', PlanningRuntimeEventPayload>;

export interface PlanRuntimeEventPayload {
  readonly plan: PlanSnapshot | null;
}

export type PlanRuntimeEvent = RuntimeEventBase<'plan', PlanRuntimeEventPayload>;

export interface PlanProgressRuntimeEventPayload {
  readonly progress: PlanProgress | null;
}

export type PlanProgressRuntimeEvent = RuntimeEventBase<'plan-progress', PlanProgressRuntimeEventPayload>;

export interface ContextUsageRuntimeEventPayload {
  readonly usage: ContextUsageSummary | null;
}

export type ContextUsageRuntimeEvent = RuntimeEventBase<'context-usage', ContextUsageRuntimeEventPayload>;

export interface CommandResultRuntimeEventPayload {
  readonly command: CommandDraft | null;
  readonly result: CommandResult | null;
  readonly preview: ObservationRenderPayload | null;
  readonly execution: CommandExecutionDetails | null;
  readonly observation: ObservationPayload | null;
  readonly planStep: PlanSnapshotStep | null;
  readonly planSnapshot: PlanHistorySnapshot | null;
}

export type CommandResultRuntimeEvent = RuntimeEventBase<
  'command-result',
  CommandResultRuntimeEventPayload
>;

export interface ErrorRuntimeEventPayload {
  readonly message: string;
  readonly details: string | null;
  readonly raw: string | null;
  readonly attempts: ReadonlyArray<ObservationParseAttempt> | null;
}

export type ErrorRuntimeEvent = RuntimeEventBase<'error', ErrorRuntimeEventPayload>;

export interface RequestInputRuntimeEventPayload {
  readonly prompt: string;
  readonly metadata: PromptRequestMetadata | null;
}

export type RequestInputRuntimeEvent = RuntimeEventBase<'request-input', RequestInputRuntimeEventPayload>;

export interface SchemaValidationFailedRuntimeEventPayload {
  readonly message: string;
  readonly errors: ReadonlyArray<SchemaValidationError>;
  readonly raw: string;
}

export type SchemaValidationFailedRuntimeEvent = RuntimeEventBase<
  'schema_validation_failed',
  SchemaValidationFailedRuntimeEventPayload
>;

export interface OpenAiResponseDebugPayload {
  readonly stage: 'openai-response';
  readonly toolCall: OpenAgentToolCall | null;
}

export interface CommandExecutionDebugPayload {
  readonly stage: 'command-execution';
  readonly command: CommandDraft | null;
  readonly result: CommandResult | null;
  readonly execution: CommandExecutionDetails | null;
  readonly observation: ObservationPayload | null;
}

export interface AssistantResponseSchemaValidationErrorDebugPayload {
  readonly stage: 'assistant-response-schema-validation-error';
  readonly message: string;
  readonly errors: ReadonlyArray<SchemaValidationError>;
  readonly raw: string;
}

export interface AssistantResponseValidationErrorDebugPayload {
  readonly stage: 'assistant-response-validation-error';
  readonly message: string;
  readonly details: string;
  readonly errors: ReadonlyArray<string>;
  readonly raw: string;
}

export interface AssistantResponseDebugPayload {
  readonly stage: 'assistant-response';
  readonly parsed: PlanResponse;
}

export interface MemoryPolicyAppliedDebugPayload {
  readonly stage: 'memory-policy-applied';
  readonly historyLength: number;
}

export interface DebugPayloadErrorDebugPayload {
  readonly stage: 'debug-payload-error';
  readonly message: string;
}

export interface StructuredStreamDebugPayload {
  readonly stage: 'structured-stream';
  readonly action: 'replace' | 'remove';
  readonly value: PlanResponseStreamPartial | null;
}

export type DebugRuntimeEventPayload =
  | OpenAiResponseDebugPayload
  | CommandExecutionDebugPayload
  | AssistantResponseSchemaValidationErrorDebugPayload
  | AssistantResponseValidationErrorDebugPayload
  | AssistantResponseDebugPayload
  | MemoryPolicyAppliedDebugPayload
  | DebugPayloadErrorDebugPayload
  | StructuredStreamDebugPayload;

export interface DebugRuntimeEvent extends RuntimeEventBase<'debug', DebugRuntimeEventPayload> {
  readonly id?: string | number | null;
}

export type RuntimeEvent =
  | BannerRuntimeEvent
  | StatusRuntimeEvent
  | PassRuntimeEvent
  | ThinkingRuntimeEvent
  | PlanningRuntimeEvent
  | AssistantMessageRuntimeEvent
  | PlanRuntimeEvent
  | PlanProgressRuntimeEvent
  | ContextUsageRuntimeEvent
  | CommandResultRuntimeEvent
  | ErrorRuntimeEvent
  | RequestInputRuntimeEvent
  | SchemaValidationFailedRuntimeEvent
  | DebugRuntimeEvent;

export type RuntimeEventObserver = (event: RuntimeEvent) => void;
