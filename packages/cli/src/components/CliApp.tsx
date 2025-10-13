import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import { Box, useApp, useInput } from 'ink';

import { cancel as cancelActive } from '@asynkron/openagent-core';

import AskHuman from './AskHuman.js';
import Plan from './Plan.js';
import DebugPanel from './DebugPanel.js';
import { Timeline } from './cliApp/Timeline.js';
import { useSlashCommandRouter } from './cliApp/slashCommands.js';
import {
  type AgentRuntimeLike,
  type AssistantMessageRuntimeEvent,
  type CliAppProps,
  type CommandInspectorState,
  type CommandLogEntry,
  type CommandPanelEvent,
  type CommandResultRuntimeEvent,
  type DebugEntry,
  type DebugRuntimeEvent,
  type ExitState,
  type InputRequestState,
  type PlanProgressState,
  type RuntimeEvent,
  type SlashCommandHandler,
  type StatusRuntimeEvent,
  type TimelineEntry,
  type TimelineEntryType,
  type TimelinePayload,
  type TimelineStatusPayload,
} from './cliApp/types.js';
import { appendWithLimit, formatDebugPayload, summarizeAutoResponseDebug } from './cliApp/logging.js';
import { writeHistorySnapshot } from './cliApp/history.js';
import type { PlanStep } from './planUtils.js';
import type { PlanProgress } from './progressUtils.js';
import type { ContextUsage } from '../status.js';

const MAX_TIMELINE_ENTRIES = 20;
const MAX_DEBUG_ENTRIES = 20;
const MAX_COMMAND_LOG_ENTRIES = 50;

const MemoPlan = memo(Plan);
const MemoDebugPanel = memo(DebugPanel);

function cloneValue<T>(value: T): T {
  if (value === undefined || value === null) {
    return value;
  }

  if (typeof value !== 'object') {
    return value;
  }

  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch (error) {
      // Fall through to JSON fallback when structured cloning fails (e.g., non-cloneable values).
    }
  }

  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch (_error) {
    return value;
  }
}

function parsePositiveInteger(value: unknown, defaultValue = 1): number {
  if (value === undefined || value === null) {
    return defaultValue;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(1, Math.floor(value));
  }

  const normalized = Number.parseInt(String(value).trim(), 10);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return defaultValue;
  }

  return Math.floor(normalized);
}

function normalizeStatus(
  event: StatusRuntimeEvent | { message?: string; level?: string; details?: unknown } | null | undefined,
): TimelineStatusPayload | null {
  if (!event || typeof event !== 'object') {
    return null;
  }

  const message = typeof event.message === 'string' ? event.message : '';
  if (!message) {
    return null;
  }

  const normalized: TimelineStatusPayload = {
    message,
  };

  if (typeof event.level === 'string' && event.level.trim()) {
    normalized.level = event.level;
  }

  if (event.details !== undefined && event.details !== null) {
    normalized.details = String(event.details);
  }

  return normalized;
}

function coerceRuntime(runtime: CliAppProps['runtime']): AgentRuntimeLike | null {
  if (!runtime || typeof runtime !== 'object') {
    return null;
  }
  return runtime as AgentRuntimeLike;
}

export function CliApp({ runtime, onRuntimeComplete, onRuntimeError }: CliAppProps): ReactElement {
  const runtimeRef = useRef<AgentRuntimeLike | null>(coerceRuntime(runtime));
  runtimeRef.current = coerceRuntime(runtime);

  const { exit } = useApp();
  const entryIdRef = useRef(0);
  const debugEventIdRef = useRef(0);
  const commandLogIdRef = useRef(0);

  const [plan, setPlan] = useState<PlanStep[]>([]);
  const [planProgress, setPlanProgress] = useState<PlanProgressState>({ seen: false, value: null });
  const [contextUsage, setContextUsage] = useState<ContextUsage | null>(null);
  const [thinking, setThinking] = useState(false);
  const [inputRequest, setInputRequest] = useState<InputRequestState | null>(null);
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [timelineKey, setTimelineKey] = useState(0);
  const [debugEvents, setDebugEvents] = useState<DebugEntry[]>([]);
  const [commandLog, setCommandLog] = useState<CommandLogEntry[]>([]);
  const [commandInspector, setCommandInspector] = useState<CommandInspectorState | null>(null);
  const [exitState, setExitState] = useState<ExitState | null>(null);
  const [passCounter, setPassCounter] = useState(0);

  const appendEntry = useCallback(
    <Type extends TimelineEntryType>(type: Type, payload: TimelinePayload<Type>): void => {
      const id = entryIdRef.current + 1;
      entryIdRef.current = id;

      let trimmed = false;
      const entry = { id, type, payload } as TimelineEntry;
      setEntries((prev) => {
        const { next, trimmed: wasTrimmed } = appendWithLimit(prev, entry, MAX_TIMELINE_ENTRIES);
        trimmed = wasTrimmed;
        return next;
      });

      if (trimmed) {
        setTimelineKey((value) => value + 1);
      }
    },
    [],
  );

  const safeSetExitState = useCallback((next: ExitState): void => {
    setExitState((prev) => prev ?? next);
  }, []);

  const handleCommandEvent = useCallback(
    (event: CommandResultRuntimeEvent): void => {
      const commandPayload = cloneValue(event.command ?? null);
      const resultPayload = cloneValue(event.result ?? null);
      const previewPayload = cloneValue(event.preview ?? {});
      const executionPayload = cloneValue(event.execution ?? null);

      appendEntry('command-result', {
        command: commandPayload,
        result: resultPayload,
        preview: previewPayload,
        execution: executionPayload,
      });

      if (commandPayload) {
        setCommandLog((prev) => {
          const entry = {
            id: commandLogIdRef.current + 1,
            command: cloneValue(commandPayload),
            receivedAt: Date.now(),
          } satisfies CommandLogEntry;
          commandLogIdRef.current = entry.id;
          return appendWithLimit(prev, entry, MAX_COMMAND_LOG_ENTRIES).next;
        });
      }
    },
    [appendEntry],
  );

  const handleAssistantMessage = useCallback(
    (event: AssistantMessageRuntimeEvent): void => {
      const rawId = event.__id;
      const eventId =
        typeof rawId === 'string' || typeof rawId === 'number' ? (rawId as string | number) : null;
      const message = typeof event.message === 'string' ? event.message : '';
      appendEntry('assistant-message', { message, eventId });
    },
    [appendEntry],
  );

  const handleStatusEvent = useCallback(
    (event: StatusRuntimeEvent | { message?: string; level?: string; details?: unknown }): void => {
      const status = normalizeStatus(event);
      if (!status) {
        return;
      }
      appendEntry('status', status);
    },
    [appendEntry],
  );

  const handleDebugEvent = useCallback(
    (event: DebugRuntimeEvent): void => {
      setDebugEvents((prev) => {
        const formatted = formatDebugPayload(event.payload);
        if (!formatted) {
          return prev;
        }

        const entryId =
          typeof event.id === 'string' || typeof event.id === 'number'
            ? (event.id as string | number)
            : debugEventIdRef.current + 1;

        if (typeof entryId === 'number') {
          debugEventIdRef.current = entryId;
        } else {
          debugEventIdRef.current += 1;
        }

        const entry: DebugEntry = { id: entryId, content: formatted };
        return appendWithLimit(prev, entry, MAX_DEBUG_ENTRIES).next;
      });

      const summary = summarizeAutoResponseDebug(event.payload);
      if (summary) {
        appendEntry('status', { level: 'warn', message: summary });
      }
    },
    [appendEntry],
  );

  const handleHistoryCommand = useCallback<SlashCommandHandler>(
    async (pathInput) => {
      const activeRuntime = runtimeRef.current;
      if (!activeRuntime || typeof activeRuntime.getHistorySnapshot !== 'function') {
        handleStatusEvent({
          type: 'status',
          level: 'error',
          message: 'History snapshot is unavailable for this session.',
        });
        return true;
      }

      let history: unknown;
      try {
        history = activeRuntime.getHistorySnapshot();
      } catch (error) {
        handleStatusEvent({
          type: 'status',
          level: 'error',
          message: 'Failed to read history from the runtime.',
          details: error,
        });
        return true;
      }

      try {
        const targetPath = await writeHistorySnapshot({
          history: Array.isArray(history) ? history : [],
          filePath: pathInput,
        });
        handleStatusEvent({
          type: 'status',
          level: 'info',
          message: `Saved history to ${targetPath}.`,
        });
      } catch (error) {
        handleStatusEvent({
          type: 'status',
          level: 'error',
          message: 'Failed to write history file.',
          details: error,
        });
      }

      return true;
    },
    [handleStatusEvent],
  );

  const handleCommandInspectorCommand = useCallback<SlashCommandHandler>(
    (rest) => {
      if (!commandLog || commandLog.length === 0) {
        handleStatusEvent({
          type: 'status',
          level: 'info',
          message: 'No commands have been received yet.',
        });
        setCommandInspector(null);
        return true;
      }

      let requested = 1;
      if (rest.length > 0) {
        const parsed = parsePositiveInteger(rest, Number.NaN);
        if (!Number.isFinite(parsed)) {
          handleStatusEvent({
            type: 'status',
            level: 'warn',
            message:
              'Command inspector requires a positive integer. Showing the latest command instead.',
          });
        } else {
          requested = parsed;
        }
      }

      const safeCount = Math.max(1, Math.min(commandLog.length, requested));
      const panelKey = Date.now();
      setCommandInspector({ requested: safeCount, token: panelKey });

      handleStatusEvent({
        type: 'status',
        level: 'info',
        message:
          safeCount === 1
            ? 'Showing the most recent command payload.'
            : `Showing the ${safeCount} most recent command payloads.`,
      });

      return true;
    },
    [commandLog, handleStatusEvent],
  );

  const slashCommandHandlers = useMemo(() => {
    const handlers = new Map<string, SlashCommandHandler>();
    handlers.set('history', handleHistoryCommand);
    handlers.set('command', handleCommandInspectorCommand);
    return handlers;
  }, [handleCommandInspectorCommand, handleHistoryCommand]);

  const routeSlashCommand = useSlashCommandRouter(slashCommandHandlers);

  const handleSubmitPrompt = useCallback(
    async (value: string) => {
      const submission = value.trim();
      if (submission.length > 0) {
        appendEntry('human-message', { message: submission });
      }

      let handledLocally = false;
      try {
        handledLocally = await routeSlashCommand(submission);
      } catch (error) {
        handledLocally = true;
        handleStatusEvent({
          type: 'status',
          level: 'error',
          message: 'Slash command processing failed.',
          details: error,
        });
      }

      if (!handledLocally) {
        const progressValue = planProgress?.value ?? null;
        const totalSteps =
          typeof progressValue?.totalSteps === 'number' && Number.isFinite(progressValue.totalSteps)
            ? progressValue.totalSteps
            : null;
        const completedSteps =
          typeof progressValue?.completedSteps === 'number' &&
          Number.isFinite(progressValue.completedSteps)
            ? progressValue.completedSteps
            : null;
        const planCompleted =
          planProgress?.seen === true &&
          totalSteps !== null &&
          completedSteps !== null &&
          totalSteps > 0 &&
          completedSteps >= totalSteps;

        if (planCompleted) {
          setPlan((prevPlan) => (Array.isArray(prevPlan) && prevPlan.length === 0 ? prevPlan : []));
          setPlanProgress((prev) => {
            if (!prev?.seen && (prev?.value === null || typeof prev?.value === 'undefined')) {
              return prev;
            }
            return { seen: false, value: null } satisfies PlanProgressState;
          });
        }

        try {
          runtimeRef.current?.submitPrompt?.(submission);
        } catch (error) {
          handleStatusEvent({
            type: 'status',
            level: 'error',
            message: 'Failed to submit input.',
            details: error,
          });
        }

        setInputRequest(null);
        return;
      }
      // Slash commands keep the runtime waiting for further input.
    },
    [appendEntry, handleStatusEvent, planProgress, routeSlashCommand],
  );

  const handleEvent = useCallback(
    (event: RuntimeEvent) => {
      if (!event || typeof event !== 'object') {
        return;
      }

      switch (event.type) {
        case 'banner':
          appendEntry('banner', {
            title: typeof event.title === 'string' ? event.title : null,
            subtitle: typeof event.subtitle === 'string' ? event.subtitle : null,
          });
          break;
        case 'status':
          handleStatusEvent(event as StatusRuntimeEvent);
          break;
        case 'pass': {
          const numericPass = Number.isFinite(event.pass)
            ? Number(event.pass)
            : Number.isFinite(event.index)
              ? Number(event.index)
              : Number.isFinite(event.value)
                ? Number(event.value)
                : null;
          setPassCounter(numericPass && numericPass > 0 ? Math.floor(numericPass) : 0);
          break;
        }
        case 'thinking':
          setThinking(event.state === 'start');
          break;
        case 'assistant-message':
          handleAssistantMessage(event as AssistantMessageRuntimeEvent);
          break;
        case 'plan':
          setPlan(Array.isArray(event.plan) ? cloneValue(event.plan) : []);
          break;
        case 'plan-progress':
          setPlanProgress({
            seen: true,
            value: event.progress ? (cloneValue(event.progress) as PlanProgress) : null,
          });
          break;
        case 'context-usage':
          setContextUsage(event.usage ? (cloneValue(event.usage) as ContextUsage) : null);
          break;
        case 'command-result':
          handleCommandEvent(event as CommandResultRuntimeEvent);
          break;
        case 'error':
          handleStatusEvent({
            type: 'status',
            level: 'error',
            message:
              typeof event.message === 'string' && event.message.trim().length > 0
                ? event.message
                : 'Agent error encountered.',
            details: event.details ?? event.raw,
          });
          break;
        case 'request-input':
          setInputRequest({
            prompt: typeof event.prompt === 'string' ? event.prompt : '▷',
            metadata:
              event.metadata === undefined || event.metadata === null
                ? null
                : cloneValue(event.metadata),
          });
          break;
        case 'debug':
          handleDebugEvent(event as DebugRuntimeEvent);
          break;
        default:
          break;
      }
    },
    [appendEntry, handleAssistantMessage, handleCommandEvent, handleDebugEvent, handleStatusEvent],
  );

  useEffect(() => {
    const activeRuntime = runtimeRef.current;
    if (!activeRuntime) {
      return undefined;
    }

    let canceled = false;
    const startPromise = activeRuntime.start();

    (async () => {
      try {
        for await (const event of activeRuntime.outputs) {
          if (canceled) {
            break;
          }
          handleEvent(event as RuntimeEvent);
        }
        await startPromise;
        if (!canceled) {
          safeSetExitState({ status: 'success' });
        }
      } catch (error) {
        if (!canceled) {
          safeSetExitState({ status: 'error', error });
        }
      }
    })();

    startPromise.catch((error) => {
      if (!canceled) {
        safeSetExitState({ status: 'error', error });
      }
    });

    return () => {
      canceled = true;
      try {
        activeRuntime.cancel?.({ reason: 'component-unmount' });
      } catch (_error) {
        // Ignore cancellation failures.
      }
    };
  }, [handleEvent, runtime, safeSetExitState]);

  useEffect(() => {
    if (!exitState) {
      return;
    }

    if (exitState.status === 'error') {
      onRuntimeError?.(exitState.error);
    } else {
      onRuntimeComplete?.();
    }

    exit();
  }, [exit, exitState, onRuntimeComplete, onRuntimeError]);

  useInput((input, key) => {
    if (key.escape) {
      cancelActive('esc-key');
      runtimeRef.current?.cancel?.({ reason: 'escape-key' });
      return;
    }
    if (key.ctrl && (input === 'c' || input === 'C')) {
      runtimeRef.current?.cancel?.({ reason: 'ctrl-c' });
      safeSetExitState({ status: 'success' });
    }
  });

  const commandPanelEvents = useMemo<CommandPanelEvent[]>(() => {
    if (!commandInspector || !commandLog?.length) {
      return [];
    }

    const safeCount = Math.max(
      1,
      Math.min(commandLog.length, parsePositiveInteger(commandInspector.requested, 1)),
    );

    return commandLog
      .slice(commandLog.length - safeCount)
      .reverse()
      .map((entry) => ({ id: entry.id, content: formatDebugPayload(entry.command) }));
  }, [commandInspector, commandLog]);

  return (
    <Box flexDirection="column">
      <Timeline entries={entries} key={`timeline-${timelineKey}`} />
      {debugEvents.length > 0 ? <MemoDebugPanel events={debugEvents} heading="Debug" /> : null}
      {commandPanelEvents.length > 0 ? (
        <MemoDebugPanel
          events={commandPanelEvents}
          heading="Recent commands"
          key={`command-${commandInspector?.token ?? 'command-inspector'}`}
        />
      ) : null}
      <AskHuman
        onSubmit={inputRequest ? handleSubmitPrompt : undefined}
        thinking={thinking}
        contextUsage={contextUsage as any}
        passCounter={passCounter}
        key="ask-human"
      />
      <MemoPlan plan={plan} key="plan" />
    </Box>
  );
}

export default CliApp;
