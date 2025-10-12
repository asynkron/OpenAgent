// @ts-nocheck
/**
 * WebSocket binding for the agent runtime.
 *
 * Translates incoming WebSocket messages into agent prompts/cancellation
 * events and streams runtime output events back over the socket as JSON.
 */
import { createAgentRuntime } from '../agent/loop.js';

const textDecoder = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;

function decodeBinary(value) {
  if (value == null) return null;
  if (typeof value === 'string') return value;

  if (typeof Buffer !== 'undefined' && Buffer.isBuffer?.(value)) {
    return value.toString('utf8');
  }

  if (typeof ArrayBuffer !== 'undefined') {
    if (value instanceof ArrayBuffer) {
      if (textDecoder) {
        return textDecoder.decode(new Uint8Array(value));
      }
      return String.fromCharCode(...new Uint8Array(value));
    }
    if (ArrayBuffer.isView?.(value)) {
      if (textDecoder) {
        return textDecoder.decode(value);
      }
      return String.fromCharCode(...value);
    }
  }

  return null;
}

function unwrapSocketMessage(raw) {
  if (!raw || typeof raw !== 'object') {
    return raw;
  }

  if (typeof raw.data !== 'undefined') {
    return unwrapSocketMessage(raw.data);
  }

  if (Array.isArray(raw) && raw.length === 1) {
    return unwrapSocketMessage(raw[0]);
  }

  return raw;
}

function defaultParseIncoming(raw) {
  const value = unwrapSocketMessage(raw);
  if (value == null) {
    return null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return { type: 'prompt', prompt: '' };
    }
    try {
      const parsed = JSON.parse(value);
      return parsed;
    } catch {
      return { type: 'prompt', prompt: value };
    }
  }

  const decoded = decodeBinary(value);
  if (typeof decoded === 'string') {
    return defaultParseIncoming(decoded);
  }

  return value;
}

function defaultFormatOutgoing(event) {
  return JSON.stringify(event ?? {});
}

function normalisePromptValue(value) {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  return String(value);
}

function attachListener(socket, event, handler) {
  if (typeof socket.on === 'function') {
    socket.on(event, handler);
    return () => {
      if (typeof socket.off === 'function') {
        socket.off(event, handler);
      } else if (typeof socket.removeListener === 'function') {
        socket.removeListener(event, handler);
      } else if (typeof socket.removeEventListener === 'function') {
        socket.removeEventListener(event, handler);
      }
    };
  }

  if (typeof socket.addEventListener === 'function') {
    socket.addEventListener(event, handler);
    return () => socket.removeEventListener?.(event, handler);
  }

  throw new Error('Socket must support on/off or addEventListener/removeEventListener.');
}

async function safeSend(socket, formatter, event, { suppressErrors = false } = {}) {
  if (!socket || typeof socket.send !== 'function') return false;

  let payload;
  try {
    payload = formatter(event);
  } catch (error) {
    if (!suppressErrors) {
      console.error('[openagent:websocket-binding] Failed to format outgoing event:', error);
    }
    return false;
  }

  if (typeof payload === 'undefined') {
    return false;
  }

  try {
    const result = socket.send(payload);
    if (result && typeof result.then === 'function') {
      await result;
    }
    return true;
  } catch (error) {
    if (!suppressErrors) {
      console.error('[openagent:websocket-binding] Failed to send runtime event to socket:', error);
    }
    return false;
  }
}

export function createWebSocketBinding({
  socket,
  runtimeOptions = {},
  createRuntime = createAgentRuntime,
  parseIncoming = defaultParseIncoming,
  formatOutgoing = defaultFormatOutgoing,
  autoStart = true,
  cancelOnDisconnect = true,
} = {}) {
  if (!socket || typeof socket !== 'object') {
    throw new Error('createWebSocketUi requires a WebSocket-like socket instance.');
  }
  if (typeof socket.send !== 'function') {
    throw new Error('Provided socket must implement send().');
  }

  const runtime = createRuntime(runtimeOptions);
  const detachFns = [];
  let started = false;
  let closed = false;
  let startPromise = null;
  let stopPromise = null;
  let pumpPromise = null;

  const detachAll = () => {
    while (detachFns.length > 0) {
      const detach = detachFns.shift();
      try {
        detach?.();
      } catch {
        // Ignore listener cleanup failures.
      }
    }
  };

  const handleMessage = (...args) => {
    if (closed) return;

    let parsed;
    try {
      parsed = parseIncoming(args.length <= 1 ? args[0] : args);
    } catch (error) {
      void safeSend(
        socket,
        formatOutgoing,
        {
          type: 'error',
          message: 'Failed to parse incoming WebSocket message.',
          details: error instanceof Error ? error.message : String(error),
        },
        { suppressErrors: true },
      );
      return;
    }

    if (parsed == null) {
      return;
    }

    if (typeof parsed === 'string') {
      runtime.submitPrompt(parsed);
      return;
    }

    if (typeof parsed !== 'object') {
      runtime.submitPrompt(String(parsed));
      return;
    }

    const type = typeof parsed.type === 'string' ? parsed.type : undefined;

    if (type === 'cancel' || parsed.cancel === true) {
      runtime.cancel(parsed.payload ?? { reason: 'socket-cancel' });
      return;
    }

    const promptValue = parsed.prompt ?? parsed.value ?? parsed.message;

    if (
      type === 'prompt' ||
      type === 'input' ||
      type === 'message' ||
      type === 'user-input' ||
      typeof promptValue !== 'undefined'
    ) {
      runtime.submitPrompt(normalisePromptValue(promptValue));
    }
  };

  const handleClose = () => {
    void stop({ reason: 'socket-close', cancel: cancelOnDisconnect });
  };

  const handleError = (error) => {
    if (closed) return;
    console.error('[openagent:websocket-binding] Socket error encountered:', error);
    void stop({ reason: 'socket-error', cancel: cancelOnDisconnect });
  };

  try {
    detachFns.push(attachListener(socket, 'message', handleMessage));
  } catch (error) {
    throw new Error(
      `Failed to attach WebSocket message listener: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    detachFns.push(attachListener(socket, 'close', handleClose));
  } catch {
    // Some sockets (e.g., minimal mocks) may not expose close events; ignore.
  }

  try {
    detachFns.push(attachListener(socket, 'error', handleError));
  } catch {
    // Optional; not all implementations expose an error event.
  }

  async function pumpOutputs() {
    const iterable =
      runtime.outputs?.[Symbol.asyncIterator]?.() ??
      (typeof runtime.outputs?.next === 'function'
        ? {
            async *[Symbol.asyncIterator]() {
              while (true) {
                const value = await runtime.outputs.next();
                if (value === undefined || value === null) {
                  continue;
                }
                yield value;
              }
            },
          }[Symbol.asyncIterator]()
        : null);

    if (!iterable) {
      return;
    }

    try {
      for await (const event of iterable) {
        if (closed) break;
        if (!event || typeof event !== 'object') continue;
        await safeSend(socket, formatOutgoing, event);
      }
    } catch (error) {
      if (!closed) {
        await safeSend(
          socket,
          formatOutgoing,
          {
            type: 'error',
            message: 'WebSocket UI failed to forward agent event.',
            details: error instanceof Error ? error.message : String(error),
          },
          { suppressErrors: true },
        );
      }
      throw error;
    }
  }

  async function stop({ reason = 'manual-stop', cancel = cancelOnDisconnect } = {}) {
    if (stopPromise) {
      return stopPromise;
    }

    closed = true;
    detachAll();

    if (cancel) {
      try {
        runtime.cancel({ reason });
      } catch {
        // Ignore cancellation failures; runtime may already be closed.
      }
    }

    try {
      runtime.outputs?.close?.();
    } catch {
      // Ignore close failures on custom queues.
    }

    stopPromise = (async () => {
      try {
        await pumpPromise?.catch(() => {});
      } finally {
        // no-op placeholder for future cleanup hooks
      }
    })();

    return stopPromise;
  }

  async function start() {
    if (startPromise) {
      return startPromise;
    }
    if (started) {
      throw new Error('WebSocket UI already started.');
    }
    started = true;
    pumpPromise = pumpOutputs();

    startPromise = (async () => {
      try {
        await runtime.start();
      } finally {
        await stop({ reason: 'runtime-complete', cancel: false });
      }
    })();

    return startPromise;
  }

  if (autoStart) {
    start().catch((error) => {
      console.error('[openagent:websocket-binding] Failed to start agent runtime:', error);
    });
  }

  return {
    runtime,
    start,
    stop,
  };
}

export default { createWebSocketBinding };
