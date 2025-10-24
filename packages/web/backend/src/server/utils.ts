import type { WebSocket } from 'ws';
import type { PromptRequestMetadata } from '@asynkron/openagent-core';

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

function normaliseAgentLabel(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

interface AgentEventBase {
  type: string;
  payload?: unknown;
  [key: string]: unknown;
}

interface AgentPayloadBase {
  __id?: string;
  agent?: string;
}

interface AssistantMessageEventPayload {
  message?: unknown;
  state?: unknown;
}

interface AssistantMessageEvent extends AgentEventBase {
  type: 'assistant-message';
  message?: unknown;
  state?: unknown;
  payload?: AssistantMessageEventPayload | null;
}

interface StatusEventPayload {
  message?: unknown;
  level?: unknown;
  details?: unknown;
  title?: unknown;
}

interface StatusEvent extends AgentEventBase {
  type: 'status';
  message?: unknown;
  level?: unknown;
  details?: unknown;
  title?: unknown;
  payload?: StatusEventPayload | null;
}

interface ErrorEventPayload {
  message?: unknown;
  details?: unknown;
}

interface ErrorEvent extends AgentEventBase {
  type: 'error';
  message?: unknown;
  details?: unknown;
  payload?: ErrorEventPayload | null;
}

interface ThinkingEventPayload {
  state?: unknown;
}

interface ThinkingEvent extends AgentEventBase {
  type: 'thinking';
  state?: unknown;
  payload?: ThinkingEventPayload | null;
}

interface PlanEventPayload {
  plan?: unknown;
}

interface PlanEvent extends AgentEventBase {
  type: 'plan';
  plan?: unknown;
  payload?: PlanEventPayload | null;
}

interface CommandResultEventPayload {
  command?: unknown;
  result?: unknown;
  preview?: unknown;
}

interface CommandResultEvent extends AgentEventBase {
  type: 'command-result';
  command?: unknown;
  result?: unknown;
  preview?: unknown;
  payload?: CommandResultEventPayload | null;
}

interface RequestInputEventPayload {
  prompt?: unknown;
  level?: unknown;
  metadata?: PromptRequestMetadata | null;
}

interface RequestInputEvent extends AgentEventBase {
  type: 'request-input';
  prompt?: unknown;
  level?: unknown;
  metadata?: PromptRequestMetadata | null;
  payload?: RequestInputEventPayload | null;
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

export interface AgentMessagePayload extends AgentPayloadBase {
  type: 'agent_message';
  text: string;
  state?: 'stream' | 'final';
}

export interface AgentStatusPayload extends AgentPayloadBase {
  type: 'agent_status';
  text: string;
  eventType: 'status';
  level?: string;
  details?: string;
  title?: string;
}

export interface AgentErrorPayload extends AgentPayloadBase {
  type: 'agent_error';
  message: string;
  details?: string;
}

export interface AgentThinkingPayload extends AgentPayloadBase {
  type: 'agent_thinking';
  state: 'start' | 'stop';
}

export interface AgentPlanPayload extends AgentPayloadBase {
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

export interface AgentCommandPayload extends AgentPayloadBase {
  type: 'agent_command';
  command?: NormalisedAgentCommand;
  exitCode?: number | null;
  runtimeMs?: number;
  killed?: boolean;
  preview?: AgentCommandPreviewPayload;
}

export interface AgentRequestInputPayload extends AgentPayloadBase {
  type: 'agent_request_input';
  prompt: string;
  level?: string;
  metadata?: PromptRequestMetadata;
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

function resolveEventField(event: AgentEventBase, field: string): unknown {
  const payload = (event as { payload?: unknown }).payload;
  if (isRecord(payload) && field in payload) {
    return payload[field];
  }
  return event[field];
}

function normaliseEventId(event: AgentEventBase): string | undefined {
  const source = (event as { __id?: unknown }).__id;
  if (typeof source === 'string') {
    const trimmed = source.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof source === 'number' && Number.isFinite(source)) {
    return String(source);
  }

  return undefined;
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

  const filter =
    typeof source.filter_regex === 'string' ? normaliseAgentText(source.filter_regex).trim() : '';
  if (filter) {
    normalised.filterRegex = filter;
  }

  const tailLines = source.tail_lines;
  if (typeof tailLines === 'number' && Number.isFinite(tailLines)) {
    normalised.tailLines = tailLines;
  }

  return Object.keys(normalised).length > 0 ? normalised : undefined;
}

function normaliseCommandResult(
  result: unknown,
): Pick<AgentCommandPayload, 'exitCode' | 'runtimeMs' | 'killed'> {
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

function serialiseMetadata(metadata: unknown): PromptRequestMetadata | undefined {
  if (!isRecord(metadata)) {
    return undefined;
  }

  try {
    const serialised = JSON.parse(JSON.stringify(metadata)) as Record<string, unknown>;
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(serialised)) {
      if (value == null) {
        continue;
      }

      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.length === 0) {
          continue;
        }
        sanitized[key] = trimmed;
        continue;
      }

      if (Array.isArray(value) && value.length === 0) {
        continue;
      }

      sanitized[key] = value;
    }

    if (typeof sanitized.scope === 'string') {
      const trimmedScope = (sanitized.scope as string).trim();
      if (trimmedScope.length === 0) {
        delete sanitized.scope;
      } else {
        sanitized.scope = trimmedScope;
        if (
          trimmedScope.toLowerCase() === 'user-input' &&
          Object.keys(sanitized).length === 1
        ) {
          delete sanitized.scope;
        }
      }
    }

    if (Object.keys(sanitized).length === 0) {
      return undefined;
    }

    return sanitized as PromptRequestMetadata;
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
  const eventId = normaliseEventId(data);
  const agentLabel = normaliseAgentLabel((data as { agent?: unknown }).agent);

  const withEventMeta = <T extends AgentPayloadBase>(payload: T): T => {
    const enriched = { ...payload } as T;
    if (eventId) {
      enriched.__id = eventId;
    }
    if (agentLabel) {
      enriched.agent = agentLabel;
    }
    return enriched;
  };

  switch (data.type) {
    case 'assistant-message': {
      const text = normaliseAgentText(
        resolveEventField(data as AssistantMessageEvent, 'message'),
      ).trim();
      if (!text) {
        return undefined;
      }

      const payload: AgentMessagePayload = { type: 'agent_message', text };
      const stateSource = resolveEventField(data as AssistantMessageEvent, 'state');
      if (typeof stateSource === 'string') {
        const normalisedState = stateSource.trim().toLowerCase();
        if (normalisedState === 'stream' || normalisedState === 'final') {
          payload.state = normalisedState as 'stream' | 'final';
        }
      }
      if (eventId && eventId.startsWith('key')) {
        return undefined;
      }
      return withEventMeta(payload);
    }
    case 'status': {
      const text = normaliseAgentText(resolveEventField(data as StatusEvent, 'message'));
      if (!text) {
        return undefined;
      }

      const payload: AgentStatusPayload = {
        type: 'agent_status',
        text,
        eventType: 'status',
      };

      const level = resolveEventField(data as StatusEvent, 'level');
      if (typeof level === 'string' && level) {
        payload.level = level;
      }

      const details = resolveEventField(data as StatusEvent, 'details');
      if (typeof details === 'string' && details) {
        payload.details = details;
      }

      const title = resolveEventField(data as StatusEvent, 'title');
      if (typeof title === 'string' && title) {
        const normalizedTitle = normaliseAgentText(title).trim();
        if (normalizedTitle) {
          payload.title = normalizedTitle;
        }
      }

      return withEventMeta(payload);
    }
    case 'error': {
      const message =
        normaliseAgentText(resolveEventField(data as ErrorEvent, 'message')).trim() ||
        'Agent runtime reported an error.';
      const payload: AgentErrorPayload = {
        type: 'agent_error',
        message,
      };

      const details = resolveEventField(data as ErrorEvent, 'details');
      if (typeof details === 'string' && details) {
        payload.details = details;
      }

      return withEventMeta(payload);
    }
    case 'thinking': {
      const state = resolveEventField(data as ThinkingEvent, 'state');
      if (state !== 'start' && state !== 'stop') {
        return undefined;
      }

      const payload: AgentThinkingPayload = { type: 'agent_thinking', state };
      return withEventMeta(payload);
    }
    case 'plan': {
      const plan = resolveEventField(data as PlanEvent, 'plan');
      if (!Array.isArray(plan)) {
        return undefined;
      }

      const payload: AgentPlanPayload = { type: 'agent_plan', plan };
      return withEventMeta(payload);
    }
    case 'command-result': {
      const payload: AgentCommandPayload = {
        type: 'agent_command',
      };

      const commandPayload = normaliseCommand(resolveEventField(data as CommandResultEvent, 'command'));
      if (commandPayload) {
        payload.command = commandPayload;
      }

      const resultPayload = normaliseCommandResult(resolveEventField(data as CommandResultEvent, 'result'));
      Object.assign(payload, resultPayload);

      const previewPayload = normaliseCommandPreview(resolveEventField(data as CommandResultEvent, 'preview'));
      if (previewPayload) {
        payload.preview = previewPayload;
      }

      return withEventMeta(payload);
    }
    case 'request-input': {
      const promptSource = normaliseAgentText(
        resolveEventField(data as RequestInputEvent, 'prompt'),
      );
      const trimmedPrompt = promptSource.trim();
      const prompt =
        trimmedPrompt === '▷' || trimmedPrompt.length === 0 ? '' : trimmedPrompt;
      const payload: AgentRequestInputPayload = {
        type: 'agent_request_input',
        prompt,
      };

      const level = resolveEventField(data as RequestInputEvent, 'level');
      if (typeof level === 'string') {
        const trimmedLevel = level.trim();
        if (trimmedLevel) {
          payload.level = trimmedLevel;
        }
      }

      const metadata = serialiseMetadata(resolveEventField(data as RequestInputEvent, 'metadata'));
      if (metadata) {
        payload.metadata = metadata;
      }

      return withEventMeta(payload);
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
