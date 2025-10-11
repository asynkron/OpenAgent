export function normaliseAgentText(value) {
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

export function formatAgentEvent(event) {
  if (!event || typeof event !== 'object') {
    return undefined;
  }

  switch (event.type) {
    case 'assistant-message': {
      const text = normaliseAgentText(event.message).trim();
      if (!text) {
        return undefined;
      }
      return JSON.stringify({ type: 'agent_message', text });
    }
    case 'status': {
      const text = normaliseAgentText(event.message);
      if (!text) {
        return undefined;
      }
      const payload = {
        type: 'agent_status',
        text,
        eventType: 'status',
      };
      if (typeof event.level === 'string' && event.level) {
        payload.level = event.level;
      }
      if (typeof event.details === 'string' && event.details) {
        payload.details = event.details;
      }
      if (typeof event.title === 'string' && event.title) {
        payload.title = normaliseAgentText(event.title);
      }
      return JSON.stringify(payload);
    }
    case 'error': {
      const message = normaliseAgentText(event.message) || 'Agent runtime reported an error.';
      const payload = {
        type: 'agent_error',
        message,
      };
      if (event.details) {
        payload.details = normaliseAgentText(event.details);
      }
      return JSON.stringify(payload);
    }
    case 'thinking': {
      if (event.state === 'start' || event.state === 'stop') {
        return JSON.stringify({ type: 'agent_thinking', state: event.state });
      }
      return undefined;
    }
    case 'plan': {
      if (Array.isArray(event.plan)) {
        return JSON.stringify({ type: 'agent_plan', plan: event.plan });
      }
      return undefined;
    }
    case 'command-result': {
      const command = event.command && typeof event.command === 'object' ? event.command : null;
      const result = event.result && typeof event.result === 'object' ? event.result : null;
      const preview = event.preview && typeof event.preview === 'object' ? event.preview : null;

      const payload = {
        type: 'agent_command',
      };

      if (command) {
        const normalizedCommand = {};
        const run = normaliseAgentText(command.run).trim();
        if (run) {
          normalizedCommand.run = run;
        }
        const description = normaliseAgentText(command.description).trim();
        if (description) {
          normalizedCommand.description = description;
        }
        if (typeof command.shell === 'string') {
          const shell = normaliseAgentText(command.shell).trim();
          if (shell) {
            normalizedCommand.shell = shell;
          }
        }
        if (typeof command.cwd === 'string') {
          const cwd = normaliseAgentText(command.cwd).trim();
          if (cwd) {
            normalizedCommand.cwd = cwd;
          }
        }
        const timeout =
          typeof command.timeout_sec === 'number'
            ? command.timeout_sec
            : typeof command.timeout === 'number'
              ? command.timeout
              : null;
        if (Number.isFinite(timeout)) {
          normalizedCommand.timeoutSeconds = timeout;
        }
        if (typeof command.filter_regex === 'string') {
          const filter = normaliseAgentText(command.filter_regex).trim();
          if (filter) {
            normalizedCommand.filterRegex = filter;
          }
        }
        if (typeof command.tail_lines === 'number' && Number.isFinite(command.tail_lines)) {
          normalizedCommand.tailLines = command.tail_lines;
        }
        if (Object.keys(normalizedCommand).length > 0) {
          payload.command = normalizedCommand;
        }
      }

      if (result) {
        if (typeof result.exit_code === 'number' || result.exit_code === null) {
          payload.exitCode = result.exit_code;
        }
        if (typeof result.runtime_ms === 'number' && Number.isFinite(result.runtime_ms)) {
          payload.runtimeMs = result.runtime_ms;
        }
        if (typeof result.killed === 'boolean') {
          payload.killed = result.killed;
        }
      }

      if (preview) {
        const stdout = normaliseAgentText(preview.stdoutPreview || preview.stdout);
        const stderr = normaliseAgentText(preview.stderrPreview || preview.stderr);
        const trimmedStdout = stdout.trim();
        const trimmedStderr = stderr.trim();
        if (trimmedStdout || trimmedStderr) {
          payload.preview = {};
          if (trimmedStdout) {
            payload.preview.stdout = stdout;
          }
          if (trimmedStderr) {
            payload.preview.stderr = stderr;
          }
        }
      }

      return JSON.stringify(payload);
    }
    case 'request-input': {
      const payload = {
        type: 'agent_request_input',
        prompt: normaliseAgentText(event.prompt),
      };
      if (typeof event.level === 'string' && event.level) {
        payload.level = event.level;
      }
      if (event.metadata && typeof event.metadata === 'object') {
        try {
          payload.metadata = JSON.parse(JSON.stringify(event.metadata));
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

export function describeAgentError(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === 'string' ? error : 'Unknown error';
}

export function isWebSocketOpen(ws) {
  return ws && ws.readyState === ws.OPEN;
}
