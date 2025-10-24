import { RuntimeEventType } from '../contracts/events.js';
import type {
  AgentRuntimeOptions,
  AsyncQueueLike,
  DebugRuntimeEvent,
  EmitRuntimeEventOptions,
  IdGeneratorFn,
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
  agentLabel: string | null;
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
  agentLabel,
}: RuntimeEmitterConfig): RuntimeEmitter {
  let counter = 0;

  const normaliseAgentLabel = (value: unknown): string | null => {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  const logWithFallback = (
    level: LoggerLevel,
    message: string,
    details: string | null = null,
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

  const emit = (event: RuntimeEvent, options?: EmitRuntimeEventOptions): void => {
    if (!event || typeof event !== 'object') {
      throw new TypeError('Agent emit expected event to be an object.');
    }

    const clonedEvent = cloneEvent(event) as RuntimeEvent;
    const providedId =
      options && typeof options.id === 'string' && options.id.length > 0 ? options.id : null;
    const existingId = (() => {
      const candidate = (clonedEvent as { __id?: unknown }).__id;
      return typeof candidate === 'string' && candidate.length > 0 ? candidate : null;
    })();
    const resolvedId = providedId ?? existingId ?? nextId();
    (clonedEvent as { __id: string }).__id = resolvedId;

    const providedAgent = normaliseAgentLabel(options?.agent);
    const existingAgent = normaliseAgentLabel((clonedEvent as { agent?: unknown }).agent);
    const defaultAgent = normaliseAgentLabel(agentLabel);
    const resolvedAgent = providedAgent ?? existingAgent ?? defaultAgent;
    if (resolvedAgent) {
      (clonedEvent as { agent: string }).agent = resolvedAgent;
    } else if (typeof (clonedEvent as { agent?: unknown }).agent !== 'undefined') {
      delete (clonedEvent as { agent?: unknown }).agent;
    }
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
          type: RuntimeEventType.Status,
          payload: {
            level: 'warn',
            message: 'eventObservers item threw.',
            details: null,
          },
        });
      }
    }
  };

  const emitFactoryWarning = (message: string, error: string | null = null): void => {
    const warning: StatusRuntimeEvent = {
      type: RuntimeEventType.Status,
      payload: {
        level: 'warn',
        message,
        details: error,
      },
    };
    emit(warning);
  };

  const emitDebug = (
    payloadOrFactory: RuntimeDebugPayload,
    options?: EmitRuntimeEventOptions,
  ): void => {
    if (!isDebugEnabled()) {
      return;
    }

    let payload: DebugRuntimeEvent['payload'] | null | undefined;
    try {
      payload = typeof payloadOrFactory === 'function' ? payloadOrFactory() : payloadOrFactory;
    } catch (error) {
      emit({
        type: RuntimeEventType.Status,
        payload: {
          level: 'warn',
          message: 'Failed to prepare debug payload.',
          details: error instanceof Error ? error.message : String(error),
        },
      });
      return;
    }

    if (!payload) {
      return;
    }

    const debugEvent: DebugRuntimeEvent = { type: 'debug', payload };
    emit(debugEvent, options);
  };

  return {
    emit,
    emitFactoryWarning,
    emitDebug,
    logWithFallback,
  };
}
