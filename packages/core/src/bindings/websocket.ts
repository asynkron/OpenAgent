/**
 * WebSocket binding for the agent runtime.
 *
 * Translates incoming WebSocket messages into agent prompts/cancellation
 * events and streams runtime output events back over the socket as JSON.
 */
import { createAgentRuntime } from '../agent/loop.js';
import { isFunction, isPromiseLike, isRecord } from './websocket/guards.js';
import {
  defaultParseIncoming,
  normaliseIncomingMessage,
  type ParseIncomingFn,
  type ParsedIncomingMessage,
} from './websocket/messageUtils.js';

type EventHandler = (...args: unknown[]) => void;

type ListenerMethod = (event: string, handler: EventHandler) => unknown;

type SendResult = void | boolean | PromiseLike<void | boolean>;

const isRuntimeEvent = (value: unknown): value is RuntimeEvent => isRecord(value);

export interface RuntimeOutputs {
  next(): Promise<RuntimeEvent | undefined>;
  close(): void;
  [Symbol.asyncIterator]?(): AsyncIterator<RuntimeEvent | undefined>;
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

export type FormatOutgoingFn = (event: RuntimeEvent) => string;

export const defaultFormatOutgoing: FormatOutgoingFn = (event) => JSON.stringify(event ?? {});

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

const hasEmitterApi = (
  socket: WebSocketLike,
): socket is WebSocketLike & {
  on: ListenerMethod;
} => isFunction(socket.on);

const hasEventTargetApi = (
  socket: WebSocketLike,
): socket is WebSocketLike & {
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
const createOutputIterable = (
  outputs?: RuntimeOutputs | null,
): AsyncIterable<RuntimeEvent> | null => {
  if (!outputs) {
    return null;
  }

  const asyncIteratorFactory = outputs[Symbol.asyncIterator];
  if (typeof asyncIteratorFactory === 'function') {
    return {
      async *[Symbol.asyncIterator]() {
        const iterator = asyncIteratorFactory.call(outputs) as AsyncIterator<
          RuntimeEvent | undefined
        >;
        try {
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
        } finally {
          try {
            const completion = iterator.return?.();
            if (isPromiseLike(completion)) {
              await completion;
            }
          } catch {
            // Swallow completion errors to avoid surfacing cleanup failures.
          }
        }
      },
    };
  }

  if (typeof outputs.next === 'function') {
    return {
      async *[Symbol.asyncIterator]() {
        try {
          while (true) {
            const value = await outputs.next();
            if (value == null) {
              continue;
            }
            yield value;
          }
        } finally {
          try {
            outputs.close?.();
          } catch {
            // Ignore cleanup failures when closing legacy runtime outputs.
          }
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

function validateSocket(socket: WebSocketLike): void {
  if (!socket || typeof socket !== 'object') {
    throw new Error('createWebSocketUi requires a WebSocket-like socket instance.');
  }
  if (!isFunction(socket.send)) {
    throw new Error('Provided socket must implement send().');
  }
}

function createDetachManager(): {
  detachFns: Array<() => void>;
  detachAll: () => void;
} {
  const detachFns: Array<() => void> = [];

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

  return { detachFns, detachAll };
}

function createMessageHandler(
  runtime: AgentRuntime,
  socket: WebSocketLike,
  parseIncoming: ParseIncomingFn,
  formatOutgoing: FormatOutgoingFn,
  closed: { current: boolean },
): EventHandler {
  return (...args) => {
    if (closed.current) return;

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

    const envelope = normaliseIncomingMessage(parsed);
    if (!envelope) {
      return;
    }

    if (envelope.kind === 'cancel') {
      runtime.cancel(envelope.payload);
      return;
    }

    runtime.submitPrompt(envelope.prompt);
  };
}

function createCloseHandler(
  stop: (options?: StopOptions) => Promise<void>,
  cancelOnDisconnect: boolean,
): EventHandler {
  return () => {
    void stop({ reason: 'socket-close', cancel: cancelOnDisconnect });
  };
}

function createErrorHandler(
  stop: (options?: StopOptions) => Promise<void>,
  cancelOnDisconnect: boolean,
  closed: { current: boolean },
): EventHandler {
  return (error) => {
    if (closed.current) return;
    console.error('[openagent:websocket-binding] Socket error encountered:', error);
    void stop({ reason: 'socket-error', cancel: cancelOnDisconnect });
  };
}

function attachSocketListeners(
  socket: WebSocketLike,
  detachFns: Array<() => void>,
  handleMessage: EventHandler,
  handleClose: EventHandler,
  handleError: EventHandler,
): void {
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
}

function createPumpOutputs(
  runtime: AgentRuntime,
  socket: WebSocketLike,
  formatOutgoing: FormatOutgoingFn,
  closed: { current: boolean },
): () => Promise<void> {
  return async () => {
    const iterable = createOutputIterable(runtime.outputs ?? null);

    if (!iterable) {
      return;
    }

    try {
      for await (const event of iterable) {
        if (closed.current) break;
        if (!isRuntimeEvent(event)) continue;
        await safeSend(socket, formatOutgoing, event);
      }
    } catch (error) {
      if (!closed.current) {
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
  validateSocket(socket);

  const runtime = createRuntime(runtimeOptions ?? {});
  const { detachFns, detachAll } = createDetachManager();
  const state = {
    started: false,
    closed: { current: false },
    startPromise: null as Promise<void> | null,
    stopPromise: null as Promise<void> | null,
    pumpPromise: null as Promise<void> | null,
  };

  const pumpOutputs = createPumpOutputs(runtime, socket, formatOutgoing, state.closed);

  async function stop({ reason = 'manual-stop', cancel = cancelOnDisconnect }: StopOptions = {}) {
    if (state.stopPromise) {
      return state.stopPromise;
    }

    state.closed.current = true;
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

    state.stopPromise = (async () => {
      try {
        await state.pumpPromise?.catch(() => {});
      } finally {
        // no-op placeholder for future cleanup hooks
      }
    })();

    return state.stopPromise;
  }

  const handleMessage = createMessageHandler(
    runtime,
    socket,
    parseIncoming,
    formatOutgoing,
    state.closed,
  );
  const handleClose = createCloseHandler(stop, cancelOnDisconnect);
  const handleError = createErrorHandler(stop, cancelOnDisconnect, state.closed);

  attachSocketListeners(socket, detachFns, handleMessage, handleClose, handleError);

  async function start() {
    if (state.startPromise) {
      return state.startPromise;
    }
    if (state.started) {
      throw new Error('WebSocket UI already started.');
    }
    state.started = true;
    state.pumpPromise = pumpOutputs();

    state.startPromise = (async () => {
      try {
        await runtime.start();
      } finally {
        await stop({ reason: 'runtime-complete', cancel: false });
      }
    })();

    return state.startPromise;
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

export { defaultParseIncoming } from './websocket/messageUtils.js';
export type {
  IncomingStructuredMessage,
  ParsedIncomingMessage,
  ParseIncomingFn,
} from './websocket/messageUtils.js';
