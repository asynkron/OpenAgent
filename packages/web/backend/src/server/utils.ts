import type { WebSocket } from 'ws';

export function normaliseAgentText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value == null) {
    return '';
  }
  try {
    return String(value);
  } catch (error) {
    console.warn('Failed to normalise agent value', error);
    return '';
  }
}

interface AgentEventBase {
  type: string;
  [key: string]: unknown;
}

interface AssistantMessageEvent extends AgentEventBase {
  type: 'assistant-message';
  message?: unknown;
}

interface StatusEvent extends AgentEventBase {
  type: 'status';
  message?: unknown;
  level?: unknown;
  details?: unknown;
  title?: unknown;
}

interface ErrorEvent extends AgentEventBase {
  type: 'error';
  message?: unknown;
  details?: unknown;
}

interface ThinkingEvent extends AgentEventBase {
  type: 'thinking';
  state?: unknown;
}

interface PlanEvent extends AgentEventBase {
  type: 'plan';
  plan?: unknown;
}

interface CommandResultEvent extends AgentEventBase {
  type: 'command-result';
  command?: unknown;
  result?: unknown;
  preview?: unknown;
}

interface RequestInputEvent extends AgentEventBase {
  type: 'request-input';
  prompt?: unknown;
  level?: unknown;
  metadata?: unknown;
}

export type AgentEvent =
  | AssistantMessageEvent
  | StatusEvent
  | ErrorEvent
  | ThinkingEvent
  | PlanEvent
  | CommandResultEvent
  | RequestInputEvent
  | AgentEventBase;

export interface AgentMessagePayload {
  type: 'agent_message';
  text: string;
}

export interface AgentStatusPayload {
  type: 'agent_status';
  text: string;
  eventType: 'status';
  level?: string;
  details?: string;
  title?: string;
}

export interface AgentErrorPayload {
  type: 'agent_error';
  message: string;
  details?: string;
}

export interface AgentThinkingPayload {
  type: 'agent_thinking';
  state: 'start' | 'stop';
}

export interface AgentPlanPayload {
  type: 'agent_plan';
  plan: unknown[];
}

export interface NormalisedAgentCommand {
  run?: string;
  description?: string;
  shell?: string;
  cwd?: string;
  timeoutSeconds?: number;
  filterRegex?: string;
  tailLines?: number;
}

export interface AgentCommandPreviewPayload {
  stdout?: string;
  stderr?: string;
}

export interface AgentCommandPayload {
  type: 'agent_command';
  command?: NormalisedAgentCommand;
  exitCode?: number | null;
  runtimeMs?: number;
  killed?: boolean;
  preview?: AgentCommandPreviewPayload;
}

export interface AgentRequestInputPayload {
  type: 'agent_request_input';
  prompt: string;
  level?: string;
  metadata?: Record<string, unknown>;
}

export type AgentPayload =
  | AgentMessagePayload
  | AgentStatusPayload
  | AgentErrorPayload
  | AgentThinkingPayload
  | AgentPlanPayload
  | AgentCommandPayload
  | AgentRequestInputPayload;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normaliseCommand(command: unknown): NormalisedAgentCommand | undefined {
  if (!isRecord(command)) {
    return undefined;
  }

  const source = command as {
    run?: unknown;
    description?: unknown;
    shell?: unknown;
    cwd?: unknown;
    timeout_sec?: unknown;
    timeout?: unknown;
    filter_regex?: unknown;
    tail_lines?: unknown;
  };

  const normalised: NormalisedAgentCommand = {};

  const run = normaliseAgentText(source.run).trim();
  if (run) {
    normalised.run = run;
  }

  const description = normaliseAgentText(source.description).trim();
  if (description) {
    normalised.description = description;
  }

  const shell = typeof source.shell === 'string' ? normaliseAgentText(source.shell).trim() : '';
  if (shell) {
    normalised.shell = shell;
  }

  const cwd = typeof source.cwd === 'string' ? normaliseAgentText(source.cwd).trim() : '';
  if (cwd) {
    normalised.cwd = cwd;
  }

  const timeoutValue = source.timeout_sec ?? source.timeout;
  if (typeof timeoutValue === 'number' && Number.isFinite(timeoutValue)) {
    normalised.timeoutSeconds = timeoutValue;
  }

  const filter = typeof source.filter_regex === 'string' ? normaliseAgentText(source.filter_regex).trim() : '';
  if (filter) {
    normalised.filterRegex = filter;
  }

  const tailLines = source.tail_lines;
  if (typeof tailLines === 'number' && Number.isFinite(tailLines)) {
    normalised.tailLines = tailLines;
  }

  return Object.keys(normalised).length > 0 ? normalised : undefined;
}

function normaliseCommandResult(result: unknown): Pick<AgentCommandPayload, 'exitCode' | 'runtimeMs' | 'killed'> {
  if (!isRecord(result)) {
    return {};
  }

  const source = result as { exit_code?: unknown; runtime_ms?: unknown; killed?: unknown };
  const payload: Pick<AgentCommandPayload, 'exitCode' | 'runtimeMs' | 'killed'> = {};

  if (typeof source.exit_code === 'number' || source.exit_code === null) {
    payload.exitCode = source.exit_code;
  }

  if (typeof source.runtime_ms === 'number' && Number.isFinite(source.runtime_ms)) {
    payload.runtimeMs = source.runtime_ms;
  }

  if (typeof source.killed === 'boolean') {
    payload.killed = source.killed;
  }

  return payload;
}

function normaliseCommandPreview(preview: unknown): AgentCommandPreviewPayload | undefined {
  if (!isRecord(preview)) {
    return undefined;
  }

  const source = preview as {
    stdoutPreview?: unknown;
    stdout?: unknown;
    stderrPreview?: unknown;
    stderr?: unknown;
  };

  const stdoutSource = source.stdoutPreview ?? source.stdout;
  const stderrSource = source.stderrPreview ?? source.stderr;

  const stdout = normaliseAgentText(stdoutSource);
  const stderr = normaliseAgentText(stderrSource);

  const trimmedStdout = stdout.trim();
  const trimmedStderr = stderr.trim();

  if (!trimmedStdout && !trimmedStderr) {
    return undefined;
  }

  const payload: AgentCommandPreviewPayload = {};
  if (trimmedStdout) {
    payload.stdout = stdout;
  }
  if (trimmedStderr) {
    payload.stderr = stderr;
  }
  return payload;
}

function serialiseMetadata(metadata: unknown): Record<string, unknown> | undefined {
  if (!isRecord(metadata)) {
    return undefined;
  }

  try {
    return JSON.parse(JSON.stringify(metadata)) as Record<string, unknown>;
  } catch (error) {
    console.warn('Failed to serialise agent metadata', error);
    return undefined;
  }
}

export function formatAgentEvent(event: unknown): AgentPayload | undefined {
  if (!event || typeof event !== 'object') {
    return undefined;
  }

  const data = event as AgentEvent;

  switch (data.type) {
    case 'assistant-message': {
      const text = normaliseAgentText((data as AssistantMessageEvent).message).trim();
      return text ? { type: 'agent_message', text } : undefined;
    }
    case 'status': {
      const text = normaliseAgentText((data as StatusEvent).message);
      if (!text) {
        return undefined;
      }

      const payload: AgentStatusPayload = {
        type: 'agent_status',
        text,
        eventType: 'status',
      };

      const level = (data as StatusEvent).level;
      if (typeof level === 'string' && level) {
        payload.level = level;
      }

      const details = (data as StatusEvent).details;
      if (typeof details === 'string' && details) {
        payload.details = details;
      }

      const title = (data as StatusEvent).title;
      if (typeof title === 'string' && title) {
        const normalizedTitle = normaliseAgentText(title).trim();
        if (normalizedTitle) {
          payload.title = normalizedTitle;
        }
      }

      return payload;
    }
    case 'error': {
      const message = normaliseAgentText((data as ErrorEvent).message).trim() ||
        'Agent runtime reported an error.';
      const payload: AgentErrorPayload = {
        type: 'agent_error',
        message,
      };

      const details = (data as ErrorEvent).details;
      if (typeof details === 'string' && details) {
        payload.details = details;
      }

      return payload;
    }
    case 'thinking': {
      const state = (data as ThinkingEvent).state;
      return state === 'start' || state === 'stop'
        ? { type: 'agent_thinking', state }
        : undefined;
    }
    case 'plan': {
      const plan = (data as PlanEvent).plan;
      return Array.isArray(plan) ? { type: 'agent_plan', plan } : undefined;
    }
    case 'command-result': {
      const payload: AgentCommandPayload = {
        type: 'agent_command',
      };

      const commandPayload = normaliseCommand((data as CommandResultEvent).command);
      if (commandPayload) {
        payload.command = commandPayload;
      }

      const resultPayload = normaliseCommandResult((data as CommandResultEvent).result);
      Object.assign(payload, resultPayload);

      const previewPayload = normaliseCommandPreview((data as CommandResultEvent).preview);
      if (previewPayload) {
        payload.preview = previewPayload;
      }

      return payload;
    }
    case 'request-input': {
      const prompt = normaliseAgentText((data as RequestInputEvent).prompt);
      const payload: AgentRequestInputPayload = {
        type: 'agent_request_input',
        prompt,
      };

      const level = (data as RequestInputEvent).level;
      if (typeof level === 'string' && level) {
        payload.level = level;
      }

      const metadata = serialiseMetadata((data as RequestInputEvent).metadata);
      if (metadata) {
        payload.metadata = metadata;
      }

      return payload;
    }
    default:
      return undefined;
  }
}

export function describeAgentError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === 'string' ? error : 'Unknown error';
}

export function isWebSocketOpen(ws: WebSocket | null | undefined): ws is WebSocket {
  return Boolean(ws && ws.readyState === ws.OPEN);
}
