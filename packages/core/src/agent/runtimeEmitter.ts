import type {
  AgentRuntimeOptions,
  AsyncQueueLike,
  IdGeneratorFn,
  RuntimeEmitter,
  RuntimeEvent,
  RuntimeEventObserver,
  UnknownRecord,
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

const cloneEvent = (event: unknown): RuntimeEvent => {
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

  const logWithFallback = (level: LoggerLevel, message: string, details: unknown = null): void => {
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

  const emit = (event: unknown): void => {
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
        } satisfies UnknownRecord);
      }
    }
  };

  const emitFactoryWarning = (message: string, error: unknown = null): void => {
    const warning: UnknownRecord = { type: 'status', level: 'warn', message };
    if (error != null) {
      warning.details = error instanceof Error ? error.message : String(error);
    }
    emit(warning);
  };

  const emitDebug = (payloadOrFactory: unknown): void => {
    if (!isDebugEnabled()) {
      return;
    }

    let payload: unknown;
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

    emit({ type: 'debug', payload });
  };

  return {
    emit,
    emitFactoryWarning,
    emitDebug,
    logWithFallback,
  };
}
