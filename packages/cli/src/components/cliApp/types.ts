import type { PlanStep } from '../planUtils.js';
import type { PlanProgress } from '../progressUtils.js';
import type { ContextUsage } from '../../status.js';
import type {
  Command as CommandPayload,
  CommandExecution,
  CommandPreview,
  CommandResult,
} from '../commandUtils.js';

type RuntimeEventBase<
  Type extends string,
  Payload extends Record<string, unknown> = Record<string, unknown>,
> = Payload & { type: Type; __id?: string | number };

export type BannerRuntimeEvent = RuntimeEventBase<
  'banner',
  { title?: string | null; subtitle?: string | null }
>;

export type StatusRuntimeEvent = RuntimeEventBase<
  'status',
  { level?: string; message?: string; details?: unknown }
>;

export type PassRuntimeEvent = RuntimeEventBase<
  'pass',
  { pass?: number; index?: number; value?: number }
>;

export type ThinkingRuntimeEvent = RuntimeEventBase<'thinking', { state?: string }>;

export type AssistantMessageRuntimeEvent = RuntimeEventBase<
  'assistant-message',
  { message?: string }
>;

export type PlanRuntimeEvent = RuntimeEventBase<'plan', { plan?: PlanStep[] | null }>;

export type PlanProgressRuntimeEvent = RuntimeEventBase<
  'plan-progress',
  { progress?: PlanProgress | null }
>;

export type ContextUsageRuntimeEvent = RuntimeEventBase<
  'context-usage',
  { usage?: ContextUsage | null }
>;

export type CommandResultRuntimeEvent = RuntimeEventBase<
  'command-result',
  {
    command?: unknown;
    result?: unknown;
    preview?: unknown;
    execution?: unknown;
    planStep?: unknown;
  }
>;

export type ErrorRuntimeEvent = RuntimeEventBase<
  'error',
  {
    message?: string;
    details?: unknown;
    raw?: unknown;
  }
>;

export type RequestInputRuntimeEvent = RuntimeEventBase<
  'request-input',
  { prompt?: string; metadata?: unknown }
>;

export type DebugRuntimeEvent = RuntimeEventBase<
  'debug',
  { payload?: unknown; id?: string | number }
>;

export type UnknownRuntimeEvent = RuntimeEventBase<string>;

export type RuntimeEvent =
  | BannerRuntimeEvent
  | StatusRuntimeEvent
  | PassRuntimeEvent
  | ThinkingRuntimeEvent
  | AssistantMessageRuntimeEvent
  | PlanRuntimeEvent
  | PlanProgressRuntimeEvent
  | ContextUsageRuntimeEvent
  | CommandResultRuntimeEvent
  | ErrorRuntimeEvent
  | RequestInputRuntimeEvent
  | DebugRuntimeEvent
  | UnknownRuntimeEvent;

export interface AgentRuntimeLike {
  start(): Promise<void>;
  submitPrompt?(value: string): void;
  cancel?(payload?: unknown): void;
  getHistorySnapshot?(): unknown;
  readonly outputs: AsyncIterable<RuntimeEvent>;
}

export type CliAppProps = {
  runtime: AgentRuntimeLike | null;
  onRuntimeComplete?: () => void;
  onRuntimeError?: (error: unknown) => void;
};

export type TimelineBannerPayload = {
  title: string | null;
  subtitle: string | null;
};

export type TimelineAssistantPayload = {
  message: string;
  eventId: string | number | null;
};

export type TimelineHumanPayload = {
  message: string;
};

export type TimelineCommandPayload = {
  command: CommandPayload | null | undefined;
  result: CommandResult | null | undefined;
  preview: CommandPreview | null | undefined;
  execution: CommandExecution | null | undefined;
  planStep: PlanStep | null | undefined;
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
  command: unknown;
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
      error: unknown;
    };

export type InputRequestState = {
  prompt: string;
  metadata: unknown;
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
