import type { PromptRequestMetadata } from './promptCoordinator.js';
import type { PlanProgress } from '../utils/plan.js';
import type { ContextUsageSummary } from '../utils/contextUsage.js';
import type { PlanStep } from '../contracts/index.js';

export type RuntimeProperty =
  | string
  | number
  | boolean
  | null
  | RuntimeProperty[]
  | { [key: string]: RuntimeProperty }
  | Record<string, unknown>
  | object;

export type RuntimeEventBase<Type extends string, Payload extends object = object> = Payload & {
  type: Type;
  __id?: string;
};

export type BannerRuntimeEvent = RuntimeEventBase<
  'banner',
  { title?: string | null; subtitle?: string | null }
>;

export type StatusRuntimeEvent = RuntimeEventBase<
  'status',
  { level?: string; message?: string; details?: RuntimeProperty }
>;

export type PassRuntimeEvent = RuntimeEventBase<'pass', { pass?: number; index?: number; value?: number }>;

export type ThinkingRuntimeEvent = RuntimeEventBase<'thinking', { state?: string }>;

export type AssistantMessageRuntimeEvent = RuntimeEventBase<'assistant-message', { message?: unknown }>;

export type PlanRuntimeEvent = RuntimeEventBase<'plan', { plan?: PlanStep[] | null }>;

export type PlanProgressRuntimeEvent = RuntimeEventBase<
  'plan-progress',
  { progress?: PlanProgress | null }
>;

export type ContextUsageRuntimeEvent = RuntimeEventBase<
  'context-usage',
  { usage?: ContextUsageSummary | null }
>;

export type CommandResultRuntimeEvent = RuntimeEventBase<
  'command-result',
  {
    command?: RuntimeProperty;
    result?: RuntimeProperty;
    preview?: RuntimeProperty;
    execution?: RuntimeProperty;
    planStep?: RuntimeProperty;
  }
>;

export type ErrorRuntimeEvent = RuntimeEventBase<
  'error',
  { message?: string; details?: RuntimeProperty; raw?: RuntimeProperty; attempts?: RuntimeProperty }
>;

export type RequestInputRuntimeEvent = RuntimeEventBase<
  'request-input',
  { prompt?: string; metadata?: PromptRequestMetadata | null }
>;

export type DebugRuntimeEvent = RuntimeEventBase<'debug', { payload?: RuntimeProperty; id?: string | number }>;

export type UnknownRuntimeEvent = RuntimeEventBase<string, Record<string, RuntimeProperty | undefined>>;

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

export type RuntimeEventObserver = (event: RuntimeEvent) => void;
