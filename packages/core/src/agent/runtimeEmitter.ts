import type {
  AgentRuntimeOptions,
  AsyncQueueLike,
  DebugRuntimeEvent,
  IdGeneratorFn,
  RuntimeProperty,
  RuntimeDebugPayload,
  RuntimeEmitter,
  RuntimeEvent,
  RuntimeEventObserver,
  StatusRuntimeEvent,
} from './runtimeTypes.js';

type LoggerLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

interface RuntimeEmitterConfig {
  outputsQueue: AsyncQueueLike<RuntimeEvent>;
  eventObservers: RuntimeEventObserver[] | null | undefined;
  logger: AgentRuntimeOptions['logger'];
  idPrefix: NonNullable<AgentRuntimeOptions['idPrefix']>;
  idGeneratorFn: AgentRuntimeOptions['idGeneratorFn'];
  isDebugEnabled: () => boolean;
}

const cloneEvent = (event: RuntimeEvent): RuntimeEvent => {
  try {
    const serialized = JSON.stringify(event);
    const parsed = JSON.parse(serialized);
    if (!parsed || typeof parsed !== 'object') {
      throw new TypeError('Runtime events must be serializable objects.');
    }
    return parsed as RuntimeEvent;
  } catch (error) {
    throw new TypeError(
      error instanceof Error ? error.message : 'Failed to serialize runtime event.',
    );
  }
};

export function createRuntimeEmitter({
  outputsQueue,
  eventObservers,
  logger,
  idPrefix,
  idGeneratorFn,
  isDebugEnabled,
}: RuntimeEmitterConfig): RuntimeEmitter {
  let counter = 0;

  const logWithFallback = (
    level: LoggerLevel,
    message: string,
    details: RuntimeProperty = null,
  ): void => {
    const sink = logger ?? console;
    const fn = sink && typeof sink[level] === 'function' ? sink[level].bind(sink) : null;
    if (fn) {
      fn(message, details);
    } else if (sink && typeof sink.log === 'function') {
      sink.log(message, details);
    }
  };

  const nextId = (): string => {
    try {
      if (typeof idGeneratorFn === 'function') {
        const id = (idGeneratorFn as IdGeneratorFn)({ counter });
        if (id) return String(id);
      }
    } catch (_error) {
      // Fall back to the default ID generation when the custom generator fails.
    }
    return `${idPrefix}${counter++}`;
  };

  const emit = (event: RuntimeEvent): void => {
    if (!event || typeof event !== 'object') {
      throw new TypeError('Agent emit expected event to be an object.');
    }

    const clonedEvent = cloneEvent(event);
    clonedEvent.__id = nextId();
    outputsQueue.push(clonedEvent);

    if (!Array.isArray(eventObservers)) {
      return;
    }

    for (const observer of eventObservers) {
      if (typeof observer !== 'function') continue;
      try {
        observer(clonedEvent);
      } catch (_error) {
        outputsQueue.push({
          type: 'status',
          level: 'warn',
          message: 'eventObservers item threw.',
        });
      }
    }
  };

  const emitFactoryWarning = (message: string, error: string | null = null): void => {
    const warning: StatusRuntimeEvent = {
      type: 'status',
      level: 'warn',
      message,
      details: error,
    };
    emit(warning);
  };

  const emitDebug = (payloadOrFactory: RuntimeDebugPayload): void => {
    if (!isDebugEnabled()) {
      return;
    }

    let payload: RuntimeProperty | void;
    try {
      payload = typeof payloadOrFactory === 'function' ? payloadOrFactory() : payloadOrFactory;
    } catch (error) {
      emit({
        type: 'status',
        level: 'warn',
        message: 'Failed to prepare debug payload.',
        details: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    if (typeof payload === 'undefined') {
      return;
    }

    const debugEvent: DebugRuntimeEvent = { type: 'debug', payload: payload as RuntimeProperty };
    emit(debugEvent);
  };

  return {
    emit,
    emitFactoryWarning,
    emitDebug,
    logWithFallback,
  };
}
