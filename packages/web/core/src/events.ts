import { normaliseAgentText } from './text.js';

export interface AgentCommandPreviewPayload {
  stdout?: string;
  stderr?: string;
}

export interface AgentCommandPayload {
  run?: string;
  description?: string;
  shell?: string;
  cwd?: string;
  timeoutSeconds?: number;
  filterRegex?: string;
  tailLines?: number;
}

export interface AgentCommandClientPayload {
  type: 'agent_command';
  command?: AgentCommandPayload;
  exitCode?: number | null;
  runtimeMs?: number;
  killed?: boolean;
  preview?: AgentCommandPreviewPayload;
}

export interface AgentMessageClientPayload {
  type: 'agent_message';
  text: string;
}

export interface AgentStatusClientPayload {
  type: 'agent_status';
  eventType: 'status';
  text: string;
  level?: string;
  details?: string;
  title?: string;
}

export interface AgentErrorClientPayload {
  type: 'agent_error';
  message: string;
  details?: string;
}

export interface AgentThinkingClientPayload {
  type: 'agent_thinking';
  state: 'start' | 'stop';
}

export interface AgentPlanClientPayload {
  type: 'agent_plan';
  plan: unknown[];
}

export interface AgentRequestInputClientPayload {
  type: 'agent_request_input';
  prompt: string;
  level?: string;
  metadata?: Record<string, unknown>;
}

export type AgentClientPayload =
  | AgentMessageClientPayload
  | AgentStatusClientPayload
  | AgentErrorClientPayload
  | AgentThinkingClientPayload
  | AgentPlanClientPayload
  | AgentCommandClientPayload
  | AgentRequestInputClientPayload;

function extractCommandPayload(raw: unknown): AgentCommandPayload | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }

  const source = raw as Record<string, unknown>;
  const command: AgentCommandPayload = {};

  const run = normaliseAgentText(source.run).trim();
  if (run) {
    command.run = run;
  }

  const description = normaliseAgentText(source.description).trim();
  if (description) {
    command.description = description;
  }

  const shellValue = source.shell;
  if (typeof shellValue === 'string') {
    const shell = normaliseAgentText(shellValue).trim();
    if (shell) {
      command.shell = shell;
    }
  }

  const cwdValue = source.cwd;
  if (typeof cwdValue === 'string') {
    const cwd = normaliseAgentText(cwdValue).trim();
    if (cwd) {
      command.cwd = cwd;
    }
  }

  const timeoutValue = (source.timeout_sec ?? source.timeout) as unknown;
  if (typeof timeoutValue === 'number' && Number.isFinite(timeoutValue)) {
    command.timeoutSeconds = timeoutValue;
  }

  const filterValue = source.filter_regex;
  if (typeof filterValue === 'string') {
    const filter = normaliseAgentText(filterValue).trim();
    if (filter) {
      command.filterRegex = filter;
    }
  }

  const tailLinesValue = source.tail_lines;
  if (typeof tailLinesValue === 'number' && Number.isFinite(tailLinesValue)) {
    command.tailLines = tailLinesValue;
  }

  return Object.keys(command).length > 0 ? command : undefined;
}

function extractCommandPreview(raw: unknown): AgentCommandPreviewPayload | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }

  const previewSource = raw as Record<string, unknown>;
  const stdout = normaliseAgentText(previewSource.stdoutPreview ?? previewSource.stdout);
  const stderr = normaliseAgentText(previewSource.stderrPreview ?? previewSource.stderr);
  const trimmedStdout = stdout.trim();
  const trimmedStderr = stderr.trim();

  if (!trimmedStdout && !trimmedStderr) {
    return undefined;
  }

  const preview: AgentCommandPreviewPayload = {};
  if (trimmedStdout) {
    preview.stdout = stdout;
  }
  if (trimmedStderr) {
    preview.stderr = stderr;
  }

  return preview;
}

function extractCommandResult(raw: unknown, target: AgentCommandClientPayload): void {
  if (!raw || typeof raw !== 'object') {
    return;
  }

  const resultSource = raw as Record<string, unknown>;
  const exitCode = resultSource.exit_code;
  if (typeof exitCode === 'number' || exitCode === null) {
    target.exitCode = exitCode as number | null;
  }

  const runtimeMs = resultSource.runtime_ms;
  if (typeof runtimeMs === 'number' && Number.isFinite(runtimeMs)) {
    target.runtimeMs = runtimeMs;
  }

  const killed = resultSource.killed;
  if (typeof killed === 'boolean') {
    target.killed = killed;
  }
}

function cloneMetadata(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  try {
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  } catch (error) {
    console.warn('Failed to serialise agent metadata', error);
    return undefined;
  }
}

export function normaliseAgentRuntimeEvent(event: unknown): AgentClientPayload | undefined {
  if (!event || typeof event !== 'object') {
    return undefined;
  }

  const data = event as { type?: unknown } & Record<string, unknown>;
  const type = typeof data.type === 'string' ? data.type : undefined;
  if (!type) {
    return undefined;
  }

  switch (type) {
    case 'assistant-message': {
      const text = normaliseAgentText(data.message).trim();
      if (!text) {
        return undefined;
      }
      return { type: 'agent_message', text };
    }
    case 'status': {
      const text = normaliseAgentText(data.message);
      if (!text) {
        return undefined;
      }
      const payload: AgentStatusClientPayload = {
        type: 'agent_status',
        eventType: 'status',
        text,
      };
      const level = data.level;
      if (typeof level === 'string' && level) {
        payload.level = level;
      }
      const details = data.details;
      if (typeof details === 'string' && details) {
        payload.details = details;
      }
      const title = data.title;
      if (typeof title === 'string' && title) {
        payload.title = normaliseAgentText(title);
      }
      return payload;
    }
    case 'error': {
      const message = normaliseAgentText(data.message) || 'Agent runtime reported an error.';
      const payload: AgentErrorClientPayload = {
        type: 'agent_error',
        message,
      };
      if (data.details != null) {
        payload.details = normaliseAgentText(data.details);
      }
      return payload;
    }
    case 'thinking': {
      const state = data.state;
      if (state === 'start' || state === 'stop') {
        return { type: 'agent_thinking', state };
      }
      return undefined;
    }
    case 'plan': {
      const plan = data.plan;
      if (Array.isArray(plan)) {
        return { type: 'agent_plan', plan };
      }
      return undefined;
    }
    case 'command-result': {
      const payload: AgentCommandClientPayload = { type: 'agent_command' };
      const command = extractCommandPayload(data.command);
      if (command) {
        payload.command = command;
      }
      extractCommandResult(data.result, payload);
      const preview = extractCommandPreview(data.preview);
      if (preview) {
        payload.preview = preview;
      }
      return payload;
    }
    case 'request-input': {
      const prompt = normaliseAgentText(data.prompt);
      const payload: AgentRequestInputClientPayload = {
        type: 'agent_request_input',
        prompt,
      };
      const level = data.level;
      if (typeof level === 'string' && level) {
        payload.level = level;
      }
      const metadata = cloneMetadata(data.metadata);
      if (metadata) {
        payload.metadata = metadata;
      }
      return payload;
    }
    default:
      return undefined;
  }
}

/**
 * Convert an arbitrary runtime event into the websocket payload used by the web client.
 */
export function serialiseAgentRuntimeEvent(event: unknown): string | undefined {
  const payload = normaliseAgentRuntimeEvent(event);
  if (!payload) {
    return undefined;
  }
  try {
    return JSON.stringify(payload);
  } catch (error) {
    console.warn('Failed to serialise agent runtime payload', error);
    return undefined;
  }
}
