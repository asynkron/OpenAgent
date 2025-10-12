/**
 * WebSocket binding for the agent runtime.
 *
 * Translates incoming WebSocket messages into agent prompts/cancellation
 * events and streams runtime output events back over the socket as JSON.
 */
import { createAgentRuntime } from '../agent/loop.js';

const textDecoder = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;

type EventHandler = (...args: unknown[]) => void;

type ListenerMethod = (event: string, handler: EventHandler) => unknown;

type SendResult = void | boolean | PromiseLike<void | boolean>;

const isFunction = (value: unknown): value is (...args: never[]) => unknown => typeof value === 'function';

const isPromiseLike = (value: unknown): value is PromiseLike<unknown> =>
  Boolean(value) && typeof value === 'object' && 'then' in (value as Record<string, unknown>) && isFunction((value as PromiseLike<unknown>).then);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object';

export interface RuntimeOutputs {
  next(): Promise<RuntimeEvent | null | undefined>;
  close(): void;
  [Symbol.asyncIterator]?(): AsyncIterator<RuntimeEvent | null | undefined>;
}

export interface RuntimeEvent extends Record<string, unknown> {}

export interface AgentRuntime {
  outputs?: RuntimeOutputs | null;
  start(): Promise<void>;
  cancel(payload?: unknown): void;
  submitPrompt(prompt: string): void;
}

export interface WebSocketLike {
  send(data: unknown): SendResult;
  on?: ListenerMethod;
  off?: ListenerMethod;
  addEventListener?: ListenerMethod;
  removeEventListener?: ListenerMethod;
  removeListener?: ListenerMethod;
}

export type RuntimeFactory = (options: Parameters<typeof createAgentRuntime>[0]) => AgentRuntime;

export type IncomingStructuredMessage = Record<string, unknown>;

export type ParsedIncomingMessage =
  | string
  | IncomingStructuredMessage
  | readonly unknown[]
  | null
  | undefined;

export interface ParseIncomingFn {
  (raw: unknown): ParsedIncomingMessage;
}

export type FormatOutgoingFn = (event: RuntimeEvent) => string;

export interface StopOptions {
  reason?: string;
  cancel?: boolean;
}

export interface CreateWebSocketBindingOptions {
  socket: WebSocketLike;
  runtimeOptions?: Parameters<typeof createAgentRuntime>[0];
  createRuntime?: RuntimeFactory;
  parseIncoming?: ParseIncomingFn;
  formatOutgoing?: FormatOutgoingFn;
  autoStart?: boolean;
  cancelOnDisconnect?: boolean;
}

export interface WebSocketBinding {
  runtime: AgentRuntime;
  start(): Promise<void>;
  stop(options?: StopOptions): Promise<void>;
}

function decodeBinary(value: unknown): string | null {
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
      const view = value as ArrayBufferView;
      if (textDecoder) {
        return textDecoder.decode(view);
      }
      const buffer = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
      return String.fromCharCode(...buffer);
    }
  }

  return null;
}

function unwrapSocketMessage(raw: unknown): unknown {
  if (Array.isArray(raw)) {
    if (raw.length === 1) {
      return unwrapSocketMessage(raw[0]);
    }
    return raw;
  }

  if (!isRecord(raw)) {
    return raw;
  }

  if ('data' in raw) {
    return unwrapSocketMessage((raw as { data: unknown }).data);
  }

  return raw;
}

export const defaultParseIncoming: ParseIncomingFn = (raw) => {
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
      return JSON.parse(value) as IncomingStructuredMessage;
    } catch {
      return { type: 'prompt', prompt: value };
    }
  }

  const decoded = decodeBinary(value);
  if (typeof decoded === 'string') {
    return defaultParseIncoming(decoded);
  }

  return value as ParsedIncomingMessage;
};

export const defaultFormatOutgoing: FormatOutgoingFn = (event) => JSON.stringify(event ?? {});

function normalisePromptValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  return String(value);
}

const hasEmitterApi = (socket: WebSocketLike): socket is WebSocketLike & {
  on: ListenerMethod;
} => isFunction(socket.on);

const hasEventTargetApi = (socket: WebSocketLike): socket is WebSocketLike & {
  addEventListener: ListenerMethod;
  removeEventListener?: ListenerMethod;
} => isFunction(socket.addEventListener);

const getRemovalMethod = (socket: WebSocketLike): ListenerMethod | undefined => {
  if (isFunction(socket.off)) return socket.off.bind(socket);
  if (isFunction(socket.removeListener)) return socket.removeListener.bind(socket);
  if (isFunction(socket.removeEventListener)) return socket.removeEventListener.bind(socket);
  return undefined;
};

function attachListener(socket: WebSocketLike, event: string, handler: EventHandler): () => void {
  if (hasEmitterApi(socket)) {
    socket.on(event, handler);
    const remove = getRemovalMethod(socket);
    return () => {
      try {
        remove?.(event, handler);
      } catch {
        // Listener cleanup failures should not surface to consumers.
      }
    };
  }

  if (hasEventTargetApi(socket)) {
    socket.addEventListener(event, handler);
    return () => {
      try {
        socket.removeEventListener?.(event, handler);
      } catch {
        // Ignore listener cleanup failures for browser-style sockets.
      }
    };
  }

  throw new Error('Socket must support on/off or addEventListener/removeEventListener.');
}

// Normalizes the runtime.outputs contract into a clean async iterable, regardless of
// whether the queue exposes Symbol.asyncIterator or a bare next() method.
const createOutputIterable = (outputs: RuntimeOutputs | null | undefined): AsyncIterable<RuntimeEvent> | null => {
  if (!outputs) {
    return null;
  }

  const asyncIteratorFactory = outputs[Symbol.asyncIterator];
  if (typeof asyncIteratorFactory === 'function') {
    return {
      async *[Symbol.asyncIterator]() {
        const iterator = asyncIteratorFactory.call(outputs) as AsyncIterator<RuntimeEvent | null | undefined>;
        while (true) {
          const result = await iterator.next();
          if (result.done) {
            break;
          }
          if (result.value == null) {
            continue;
          }
          yield result.value;
        }
      },
    };
  }

  if (typeof outputs.next === 'function') {
    return {
      async *[Symbol.asyncIterator]() {
        while (true) {
          const value = await outputs.next();
          if (value == null) {
            continue;
          }
          yield value;
        }
      },
    };
  }

  return null;
};

async function safeSend(
  socket: WebSocketLike,
  formatter: FormatOutgoingFn,
  event: RuntimeEvent,
  { suppressErrors = false }: { suppressErrors?: boolean } = {},
): Promise<boolean> {
  if (!socket || !isFunction(socket.send)) return false;

  let payload: unknown;
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
    if (isPromiseLike(result)) {
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
  createRuntime = createAgentRuntime as RuntimeFactory,
  parseIncoming = defaultParseIncoming,
  formatOutgoing = defaultFormatOutgoing,
  autoStart = true,
  cancelOnDisconnect = true,
}: CreateWebSocketBindingOptions): WebSocketBinding {
  if (!socket || typeof socket !== 'object') {
    throw new Error('createWebSocketUi requires a WebSocket-like socket instance.');
  }
  if (!isFunction(socket.send)) {
    throw new Error('Provided socket must implement send().');
  }

  const runtime = createRuntime(runtimeOptions ?? {});
  const detachFns: Array<() => void> = [];
  let started = false;
  let closed = false;
  let startPromise: Promise<void> | null = null;
  let stopPromise: Promise<void> | null = null;
  let pumpPromise: Promise<void> | null = null;

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

  const handleMessage: EventHandler = (...args) => {
    if (closed) return;

    let parsed: ParsedIncomingMessage;
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

    if (!isRecord(parsed)) {
      runtime.submitPrompt(String(parsed));
      return;
    }

    const type = typeof parsed.type === 'string' ? (parsed.type as string) : undefined;

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

  const handleClose: EventHandler = () => {
    void stop({ reason: 'socket-close', cancel: cancelOnDisconnect });
  };

  const handleError: EventHandler = (error) => {
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

  const pumpOutputs = async () => {
    const iterable = createOutputIterable(runtime.outputs ?? null);

    if (!iterable) {
      return;
    }

    try {
      for await (const event of iterable) {
        if (closed) break;
        if (!isRecord(event)) continue;
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
  };

  async function stop({ reason = 'manual-stop', cancel = cancelOnDisconnect }: StopOptions = {}) {
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

const defaultExport = { createWebSocketBinding } satisfies Record<string, unknown>;

export default defaultExport;
