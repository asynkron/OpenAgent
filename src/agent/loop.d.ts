/**
 * Conversational role metadata attached to history entries exchanged with the model.
 */
export interface ConversationMessage {
  role: string;
  content: unknown;
}

/** Summary describing how much of the current context window is consumed. */
export interface ContextUsageSummary {
  total: number | null;
  used: number;
  remaining: number | null;
  percentRemaining: number | null;
}

export type AgentStatusLevel = 'info' | 'warn';

export interface AgentStatusEvent {
  type: 'status';
  level: AgentStatusLevel;
  message: string;
  details?: string;
}

export interface AgentErrorAttempt {
  strategy: string;
  message: string;
}

export interface AgentErrorEvent {
  type: 'error';
  message: string;
  details?: string;
  raw?: string;
  attempts?: readonly AgentErrorAttempt[];
}

export interface AgentDebugEvent {
  type: 'debug';
  payload: unknown;
}

export interface AgentBannerEvent {
  type: 'banner';
  title: string;
}

export interface AgentThinkingEvent {
  type: 'thinking';
  state: 'start' | 'stop';
}

export interface AgentContextUsageEvent {
  type: 'context-usage';
  usage: ContextUsageSummary;
}

export type PlanStatus = 'pending' | 'running' | 'completed';

export interface PlanStep {
  step: string;
  title: string;
  status: PlanStatus;
  substeps?: PlanStep[];
  [key: string]: unknown;
}

export interface AgentPlanEvent {
  type: 'plan';
  plan: PlanStep[];
}

export interface PlanProgressSummary {
  completedSteps: number;
  remainingSteps: number;
  totalSteps: number;
  ratio: number;
}

export interface AgentPlanProgressEvent {
  type: 'plan-progress';
  progress: PlanProgressSummary;
}

export interface AssistantMessageEvent {
  type: 'assistant-message';
  message: string;
}

export interface RequestInputEvent {
  type: 'request-input';
  prompt: string;
  metadata: Record<string, unknown>;
}

export interface SchemaValidationErrorDescriptor {
  path: string;
  message: string;
  keyword: string;
  instancePath: string;
  params: Record<string, unknown>;
}

export interface SchemaValidationFailedEvent {
  type: 'schema_validation_failed';
  message: string;
  errors: SchemaValidationErrorDescriptor[];
  raw?: string;
}

export interface CommandPreview {
  stdout: string;
  stderr: string;
  stdoutPreview: string;
  stderrPreview: string;
}

export interface AgentCommand {
  reason?: string;
  shell?: string;
  run?: string;
  cwd?: string;
  timeout_sec?: number;
  filter_regex?: string;
  tail_lines?: number;
  [key: string]: unknown;
}

export interface CommandExecutionResult {
  stdout?: string;
  stderr?: string;
  exit_code?: number | null;
  runtime_ms?: number;
  killed?: boolean;
  [key: string]: unknown;
}

export interface CommandExecutionDetails {
  type: string;
  command: AgentCommand;
  [key: string]: unknown;
}

export interface CommandResultEvent {
  type: 'command-result';
  command: AgentCommand;
  result: CommandExecutionResult;
  preview: CommandPreview;
  execution: CommandExecutionDetails;
}

export type AgentEvent =
  | AgentStatusEvent
  | AgentErrorEvent
  | AgentDebugEvent
  | AgentBannerEvent
  | AgentThinkingEvent
  | AgentContextUsageEvent
  | AgentPlanEvent
  | AgentPlanProgressEvent
  | AssistantMessageEvent
  | RequestInputEvent
  | SchemaValidationFailedEvent
  | CommandResultEvent;

export type AgentInputEvent =
  | { type: 'prompt'; prompt: string }
  | { type: 'cancel'; payload?: unknown };

export interface HistoryCompactorLike {
  compactIfNeeded?(options: { history: ConversationMessage[] }):
    | boolean
    | Promise<boolean>
    | void
    | Promise<void>;
}

export interface OpenAIClientLike {
  responses?: {
    create?: (...args: unknown[]) => Promise<unknown>;
  };
  [key: string]: unknown;
}

export interface AgentRuntimeOptions {
  systemPrompt?: string;
  systemPromptAugmentation?: string;
  getClient?: () => OpenAIClientLike;
  model?: string;
  runCommandFn?: (
    command: string,
    cwd: string,
    timeout: number,
    shell?: string,
  ) => Promise<CommandExecutionResult>;
  applyFilterFn?: (text: string, pattern?: string) => string;
  tailLinesFn?: (text: string, lineCount?: number) => string;
  isPreapprovedCommandFn?: (command: AgentCommand) => boolean | Promise<boolean>;
  isSessionApprovedFn?: (command: AgentCommand) => boolean | Promise<boolean>;
  approveForSessionFn?: (command: AgentCommand) => void | Promise<void>;
  preapprovedCfg?: unknown;
  getAutoApproveFlag?: () => boolean;
  getNoHumanFlag?: () => boolean;
  getPlanMergeFlag?: () => boolean;
  getDebugFlag?: () => boolean;
  setNoHumanFlag?: (value: boolean) => void;
  emitAutoApproveStatus?: boolean;
  createHistoryCompactorFn?: (context: {
    openai: OpenAIClientLike;
    currentModel: string;
  }) => HistoryCompactorLike | null | undefined;
}

export interface AgentQueue<T> extends AsyncIterable<T> {
  next(): Promise<T | undefined>;
  push(value: T): boolean;
  close(): void;
  [Symbol.asyncIterator](): AsyncIterableIterator<T>;
}

export interface AgentRuntime {
  outputs: AgentQueue<AgentEvent>;
  inputs: AgentQueue<AgentInputEvent>;
  start(): Promise<void>;
  submitPrompt(value: string): boolean;
  cancel(payload?: unknown): boolean;
}

export type AgentLoop = () => Promise<void>;

export function createAgentRuntime(options?: AgentRuntimeOptions): AgentRuntime;
export function createAgentLoop(options?: AgentRuntimeOptions): AgentLoop;

export interface OpenAgentToolCall {
  name: 'open-agent';
  call_id: string | null;
  arguments: string;
}

export function extractOpenAgentToolCall(response: unknown): OpenAgentToolCall | null;
export function extractResponseText(response: unknown): string;

declare const _default: {
  createAgentLoop: typeof createAgentLoop;
  createAgentRuntime: typeof createAgentRuntime;
  extractOpenAgentToolCall: typeof extractOpenAgentToolCall;
  extractResponseText: typeof extractResponseText;
};

export default _default;
