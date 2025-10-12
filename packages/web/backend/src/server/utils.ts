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

export type AgentEvent =
  | { type: 'assistant-message'; message: unknown }
  | { type: 'status'; message?: unknown; level?: unknown; details?: unknown; title?: unknown }
  | { type: 'error'; message?: unknown; details?: unknown }
  | { type: 'thinking'; state?: unknown }
  | { type: 'plan'; plan?: unknown }
  | { type: 'command-result'; command?: unknown; result?: unknown; preview?: unknown }
  | { type: 'request-input'; prompt?: unknown; level?: unknown; metadata?: unknown }
  | { type: string };

export function formatAgentEvent(event: unknown): string | undefined {
  if (!event || typeof event !== 'object') {
    return undefined;
  }

  const data = event as AgentEvent;

  switch (data.type) {
    case 'assistant-message': {
      const text = normaliseAgentText((data as { message?: unknown }).message).trim();
      if (!text) {
        return undefined;
      }
      return JSON.stringify({ type: 'agent_message', text });
    }
    case 'status': {
      const text = normaliseAgentText((data as { message?: unknown }).message);
      if (!text) {
        return undefined;
      }
      const payload: Record<string, unknown> = {
        type: 'agent_status',
        text,
        eventType: 'status',
      };
      const level = (data as { level?: unknown }).level;
      if (typeof level === 'string' && level) {
        payload.level = level;
      }
      const details = (data as { details?: unknown }).details;
      if (typeof details === 'string' && details) {
        payload.details = details;
      }
      const title = (data as { title?: unknown }).title;
      if (typeof title === 'string' && title) {
        payload.title = normaliseAgentText(title);
      }
      return JSON.stringify(payload);
    }
    case 'error': {
      const message = normaliseAgentText((data as { message?: unknown }).message) ||
        'Agent runtime reported an error.';
      const payload: Record<string, unknown> = {
        type: 'agent_error',
        message,
      };
      const details = (data as { details?: unknown }).details;
      if (details != null) {
        payload.details = normaliseAgentText(details);
      }
      return JSON.stringify(payload);
    }
    case 'thinking': {
      const state = (data as { state?: unknown }).state;
      if (state === 'start' || state === 'stop') {
        return JSON.stringify({ type: 'agent_thinking', state });
      }
      return undefined;
    }
    case 'plan': {
      const plan = (data as { plan?: unknown }).plan;
      if (Array.isArray(plan)) {
        return JSON.stringify({ type: 'agent_plan', plan });
      }
      return undefined;
    }
    case 'command-result': {
      const command = (data as { command?: unknown }).command;
      const result = (data as { result?: unknown }).result;
      const preview = (data as { preview?: unknown }).preview;

      const payload: Record<string, unknown> = {
        type: 'agent_command',
      };

      if (command && typeof command === 'object') {
        const normalizedCommand: Record<string, unknown> = {};
        const run = normaliseAgentText((command as { run?: unknown }).run).trim();
        if (run) {
          normalizedCommand.run = run;
        }
        const description = normaliseAgentText((command as { description?: unknown }).description).trim();
        if (description) {
          normalizedCommand.description = description;
        }
        const shellValue = (command as { shell?: unknown }).shell;
        if (typeof shellValue === 'string') {
          const shell = normaliseAgentText(shellValue).trim();
          if (shell) {
            normalizedCommand.shell = shell;
          }
        }
        const cwdValue = (command as { cwd?: unknown }).cwd;
        if (typeof cwdValue === 'string') {
          const cwd = normaliseAgentText(cwdValue).trim();
          if (cwd) {
            normalizedCommand.cwd = cwd;
          }
        }
        const timeoutValue = (command as { timeout_sec?: unknown; timeout?: unknown }).timeout_sec ??
          (command as { timeout_sec?: unknown; timeout?: unknown }).timeout;
        if (typeof timeoutValue === 'number' && Number.isFinite(timeoutValue)) {
          normalizedCommand.timeoutSeconds = timeoutValue;
        }
        const filterValue = (command as { filter_regex?: unknown }).filter_regex;
        if (typeof filterValue === 'string') {
          const filter = normaliseAgentText(filterValue).trim();
          if (filter) {
            normalizedCommand.filterRegex = filter;
          }
        }
        const tailLinesValue = (command as { tail_lines?: unknown }).tail_lines;
        if (typeof tailLinesValue === 'number' && Number.isFinite(tailLinesValue)) {
          normalizedCommand.tailLines = tailLinesValue;
        }
        if (Object.keys(normalizedCommand).length > 0) {
          payload.command = normalizedCommand;
        }
      }

      if (result && typeof result === 'object') {
        const exitCode = (result as { exit_code?: unknown }).exit_code;
        if (typeof exitCode === 'number' || exitCode === null) {
          payload.exitCode = exitCode;
        }
        const runtimeMs = (result as { runtime_ms?: unknown }).runtime_ms;
        if (typeof runtimeMs === 'number' && Number.isFinite(runtimeMs)) {
          payload.runtimeMs = runtimeMs;
        }
        const killed = (result as { killed?: unknown }).killed;
        if (typeof killed === 'boolean') {
          payload.killed = killed;
        }
      }

      if (preview && typeof preview === 'object') {
        const stdout = normaliseAgentText(
          (preview as { stdoutPreview?: unknown; stdout?: unknown }).stdoutPreview ??
            (preview as { stdoutPreview?: unknown; stdout?: unknown }).stdout,
        );
        const stderr = normaliseAgentText(
          (preview as { stderrPreview?: unknown; stderr?: unknown }).stderrPreview ??
            (preview as { stderrPreview?: unknown; stderr?: unknown }).stderr,
        );
        const trimmedStdout = stdout.trim();
        const trimmedStderr = stderr.trim();
        if (trimmedStdout || trimmedStderr) {
          payload.preview = {};
          if (trimmedStdout) {
            (payload.preview as Record<string, unknown>).stdout = stdout;
          }
          if (trimmedStderr) {
            (payload.preview as Record<string, unknown>).stderr = stderr;
          }
        }
      }

      return JSON.stringify(payload);
    }
    case 'request-input': {
      const payload: Record<string, unknown> = {
        type: 'agent_request_input',
        prompt: normaliseAgentText((data as { prompt?: unknown }).prompt),
      };
      const level = (data as { level?: unknown }).level;
      if (typeof level === 'string' && level) {
        payload.level = level;
      }
      const metadata = (data as { metadata?: unknown }).metadata;
      if (metadata && typeof metadata === 'object') {
        try {
          payload.metadata = JSON.parse(JSON.stringify(metadata));
        } catch (error) {
          console.warn('Failed to serialise agent metadata', error);
        }
      }
      return JSON.stringify(payload);
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
