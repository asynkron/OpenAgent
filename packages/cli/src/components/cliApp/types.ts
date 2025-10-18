import type { PlanStep } from '../planUtils.js';
import type { PlanProgress } from '../progressUtils.js';
import type {
  Command as CommandPayload,
  CommandExecution,
  CommandPreview,
  CommandResult,
} from '../commandUtils.js';
import type {
  AssistantMessageRuntimeEvent,
  BannerRuntimeEvent,
  ChatMessageEntry,
  CommandResultRuntimeEvent,
  ContextUsageRuntimeEvent,
  DebugRuntimeEvent,
  ErrorRuntimeEvent,
  PassRuntimeEvent,
  PlanProgressRuntimeEvent,
  PlanRuntimeEvent,
  PromptRequestMetadata,
  RequestInputRuntimeEvent,
  RuntimeEvent,
  RuntimeEventBase,
  RuntimeProperty,
  StatusRuntimeEvent,
  ThinkingRuntimeEvent,
  UnknownRuntimeEvent,
} from '@asynkron/openagent-core';

export type {
  AssistantMessageRuntimeEvent,
  BannerRuntimeEvent,
  CommandResultRuntimeEvent,
  ContextUsageRuntimeEvent,
  DebugRuntimeEvent,
  ErrorRuntimeEvent,
  PassRuntimeEvent,
  PlanProgressRuntimeEvent,
  PlanRuntimeEvent,
  RequestInputRuntimeEvent,
  RuntimeEvent,
  RuntimeEventBase,
  RuntimeProperty,
  StatusRuntimeEvent,
  ThinkingRuntimeEvent,
  UnknownRuntimeEvent,
};

type CancellationPayload = string | { reason: string } | null;

export type RuntimeErrorPayload = Error | RuntimeProperty;

export type StatusLikePayload = {
  type?: 'status';
  level?: string;
  message?: string;
  details?: RuntimeProperty;
};

export interface AgentRuntimeLike {
  start(): Promise<void>;
  submitPrompt?(value: string): void;
  cancel?(payload?: CancellationPayload): void;
  getHistorySnapshot?(): readonly ChatMessageEntry[];
  readonly outputs: AsyncIterable<RuntimeEvent>;
}

export type CliAppProps = {
  runtime: AgentRuntimeLike | null;
  onRuntimeComplete?: () => void;
  onRuntimeError?: (error: RuntimeErrorPayload) => void;
};

export type TimelineBannerPayload = {
  title: string | null;
  subtitle: string | null;
};

export type TimelineAssistantPayload = {
  message: RuntimeProperty;
  eventId: string;
};

export type TimelineHumanPayload = {
  message: string;
};

export type TimelineCommandPayload = {
  command: CommandPayload | null;
  result: CommandResult | null;
  preview: CommandPreview | null;
  execution: CommandExecution | null;
  planStep: PlanStep | null;
};

export type TimelineStatusPayload = {
  level?: string;
  message: string;
  details?: string | null;
};

export type TimelineEntryBase<Type extends string, Payload> = {
  id: number;
  type: Type;
  payload: Payload;
};

export type TimelineEntry =
  | TimelineEntryBase<'assistant-message', TimelineAssistantPayload>
  | TimelineEntryBase<'human-message', TimelineHumanPayload>
  | TimelineEntryBase<'command-result', TimelineCommandPayload>
  | TimelineEntryBase<'banner', TimelineBannerPayload>
  | TimelineEntryBase<'status', TimelineStatusPayload>;

export type TimelineEntryType = TimelineEntry['type'];

export type TimelinePayload<Type extends TimelineEntryType> = Extract<
  TimelineEntry,
  { type: Type }
>['payload'];

export type DebugEntry = {
  id: string | number;
  content: string;
};

export type CommandLogEntry = {
  id: number;
  command: CommandPayload;
  receivedAt: number;
};

export type CommandInspectorState = {
  requested: number;
  token: number;
};

export type ExitState =
  | { status: 'success' }
  | {
      status: 'error';
      error: RuntimeErrorPayload;
    };

export type InputRequestState = {
  prompt: string;
  metadata: PromptRequestMetadata | null;
};

export type PlanProgressState = {
  seen: boolean;
  value: PlanProgress | null;
};

export type SlashCommandHandler = (rest: string) => boolean | Promise<boolean>;

export type SlashCommandRouter = (submission: string) => Promise<boolean>;

export type CommandPanelEvent = {
  id: string | number;
  content: string;
};
