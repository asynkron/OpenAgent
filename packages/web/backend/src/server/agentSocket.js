import { createWebSocketBinding } from '@asynkron/openagent';
import { describeAgentError, formatAgentEvent, isWebSocketOpen, normaliseAgentText } from './utils.js';

export class AgentSocketManager {
  constructor({ agentConfig, sendPayload }) {
    this.agentConfig = agentConfig;
    this.sendPayload = sendPayload;
    this.clients = new Map(); // ws -> { binding, cleaned, cleanup }
  }

  buildRuntimeOptions() {
    if (this.agentConfig?.autoApprove === false) {
      return undefined;
    }
    return {
      getAutoApproveFlag: () => true,
      emitAutoApproveStatus: true,
    };
  }

  handleConnection(ws) {
    let binding;
    console.log('Agent websocket connection received - initialising runtime binding');
    try {
      const runtimeOptions = this.buildRuntimeOptions();
      const bindingOptions = {
        socket: ws,
        autoStart: false,
        formatOutgoing: (event) => {
          console.log('Agent runtime emitted event', event);
          return formatAgentEvent(event);
        },
      };

      if (runtimeOptions) {
        bindingOptions.runtimeOptions = runtimeOptions;
      }

      binding = createWebSocketBinding(bindingOptions);
    } catch (error) {
      const details = describeAgentError(error);
      this.sendPayload(ws, {
        type: 'agent_error',
        message: 'Failed to initialize the agent runtime.',
        details,
      });
      try {
        ws.close(1011, 'Agent runtime unavailable');
      } catch (closeError) {
        console.warn('Failed to close agent websocket after initialization error', closeError);
      }
      return;
    }

    const record = {
      binding,
      cleaned: false,
      cleanup: null,
    };

    let cleanup;

    const handleClose = () => {
      console.log('Agent websocket closed by client');
      void cleanup?.('socket-close');
    };

    const handleError = (socketError) => {
      if (socketError && socketError.message) {
        console.warn('Agent websocket error', socketError);
      }
      void cleanup?.('socket-error');
    };

    cleanup = async (reason = 'socket-close') => {
      if (record.cleaned) {
        return;
      }
      record.cleaned = true;
      this.clients.delete(ws);

      console.log('Cleaning up agent websocket binding', { reason });

      try {
        ws.off?.('close', handleClose);
        ws.off?.('error', handleError);
      } catch (error) {
        // Ignore listener removal failures; the socket may already be closed.
      }

      try {
        await binding.stop?.({ reason });
      } catch (error) {
        console.warn('Failed to stop agent binding cleanly', error);
      }
    };

    record.cleanup = cleanup;
    this.clients.set(ws, record);

    ws.on('close', handleClose);
    ws.on('error', handleError);

    ws.on('message', (raw, isBinary) => {
      let serialized;
      if (typeof raw === 'string') {
        serialized = raw;
      } else if (Buffer.isBuffer(raw)) {
        serialized = raw.toString('utf8');
      } else if (!isBinary && raw && typeof raw.toString === 'function') {
        serialized = raw.toString();
      } else {
        serialized = '';
      }

      console.log('Agent websocket received payload', serialized || raw);

      if (!serialized || !binding?.runtime?.submitPrompt) {
        return;
      }

      let parsed;
      try {
        parsed = JSON.parse(serialized);
      } catch (error) {
        return;
      }

      if (!parsed || typeof parsed !== 'object') {
        return;
      }

      const type = typeof parsed.type === 'string' ? parsed.type.toLowerCase() : undefined;
      if (type !== 'chat' && type !== 'prompt') {
        return;
      }

      const promptSource =
        typeof parsed.prompt !== 'undefined'
          ? parsed.prompt
          : typeof parsed.text !== 'undefined'
          ? parsed.text
          : typeof parsed.value !== 'undefined'
            ? parsed.value
            : parsed.message;

      if (typeof promptSource === 'undefined') {
        return;
      }

      const prompt =
        typeof promptSource === 'string'
          ? promptSource.trim()
          : normaliseAgentText(promptSource).trim();

      if (!prompt) {
        return;
      }

      try {
        binding.runtime.submitPrompt(prompt);
        console.log('Forwarded agent prompt payload to runtime queue');
      } catch (error) {
        console.warn('Failed to forward agent prompt payload to runtime queue', error);
      }
    });

    try {
      const startResult = binding.start?.();
      if (startResult && typeof startResult.then === 'function') {
        startResult
          .then(() => {
            console.log('Agent runtime reported async start completion');
          })
          .catch(async (startError) => {
            const details = describeAgentError(startError);
            this.sendPayload(ws, {
              type: 'agent_error',
              message: 'Agent runtime failed to start.',
              details,
            });
            await cleanup('runtime-error');
            try {
              ws.close(1011, 'Agent runtime failed to start');
            } catch (closeError) {
              console.warn('Failed to close agent websocket after runtime error', closeError);
            }
          });
      } else {
        console.log('Agent runtime started synchronously');
      }
    } catch (error) {
      const details = describeAgentError(error);
      this.sendPayload(ws, {
        type: 'agent_error',
        message: 'Agent runtime failed to start.',
        details,
      });
      void cleanup('runtime-error');
      try {
        ws.close(1011, 'Agent runtime failed to start');
      } catch (closeError) {
        console.warn('Failed to close agent websocket after synchronous runtime error', closeError);
      }
    }
  }

  async stopAll(reason = 'server-stop') {
    const entries = Array.from(this.clients.entries());
    for (const [ws, record] of entries) {
      const binding = record?.binding ?? record;
      if (record?.cleanup) {
        try {
          await record.cleanup(reason);
        } catch (error) {
          console.warn('Failed to clean up agent binding', error);
        }
      } else if (binding) {
        try {
          await binding.stop?.({ reason });
        } catch (error) {
          console.warn('Failed to stop agent binding', error);
        }
      }

      try {
        ws.close();
      } catch (error) {
        console.warn('Failed to close agent websocket', error);
      }
    }
    this.clients.clear();
  }
}

export function sendAgentPayload(ws, payload) {
  if (!payload) {
    return false;
  }

  if (!isWebSocketOpen(ws)) {
    return false;
  }

  try {
    ws.send(JSON.stringify(payload));
    return true;
  } catch (error) {
    console.warn('Failed to send agent payload to client', error);
    return false;
  }
}
