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
import Timeline from './cliApp/Timeline.js';
import { useSlashCommandRouter } from './cliApp/slashCommands.js';
import { useRuntimeEventRouter } from './cliApp/useRuntimeEventRouter.js';
import {
  type AgentRuntimeLike,
  type AssistantMessageRuntimeEvent,
  type BannerRuntimeEvent,
  type CliAppProps,
  type CommandResultRuntimeEvent,
  type DebugRuntimeEvent,
  type ErrorRuntimeEvent,
  type ExitState,
  type InputRequestState,
  type PassRuntimeEvent,
  type PlanProgressState,
  type PlanProgressRuntimeEvent,
  type PlanRuntimeEvent,
  type RequestInputRuntimeEvent,
  type RuntimeEvent,
  type RuntimeErrorPayload,
  type SlashCommandHandler,
  type TimelinePayload,
  type StatusRuntimeEvent,
  type ContextUsageRuntimeEvent,
  type StatusLikePayload,
  type ThinkingRuntimeEvent,
} from './cliApp/types.js';
import { coerceRuntime, cloneValue, normalizeStatus } from './cliApp/runtimeUtils.js';
import { useCommandLog } from './cliApp/useCommandLog.js';
import { useDebugPanel } from './cliApp/useDebugPanel.js';
import { useHistoryCommand } from './cliApp/useHistoryCommand.js';
import { useTimeline } from './cliApp/useTimeline.js';
import type { PlanStep } from './planUtils.js';
import type { PlanProgress } from './progressUtils.js';
import type { ContextUsage } from '../status.js';

const MAX_TIMELINE_ENTRIES = 20;
const MAX_DEBUG_ENTRIES = 20;
const MAX_COMMAND_LOG_ENTRIES = 50;

const MemoPlan = memo(Plan);
const MemoDebugPanel = memo(DebugPanel);

const UNKNOWN_ERROR_MESSAGE = 'Unknown runtime error';

function toRuntimeErrorPayload(value: unknown): RuntimeErrorPayload {
  if (value instanceof Error) {
    return value;
  }
  if (value === undefined || value === null) {
    return UNKNOWN_ERROR_MESSAGE;
  }
  if (typeof value === 'string') {
    return value;
  }
  return String(value);
}

function CliApp({ runtime, onRuntimeComplete, onRuntimeError }: CliAppProps): ReactElement {
  const runtimeRef = useRef<AgentRuntimeLike | null>(coerceRuntime(runtime));
  runtimeRef.current = coerceRuntime(runtime);

  const { exit } = useApp();
  const [plan, setPlan] = useState<PlanStep[]>([]);
  const [planProgress, setPlanProgress] = useState<PlanProgressState>({ seen: false, value: null });
  const [contextUsage, setContextUsage] = useState<ContextUsage | null>(null);
  const [thinking, setThinking] = useState(false);
  const [inputRequest, setInputRequest] = useState<InputRequestState | null>(null);
  const [exitState, setExitState] = useState<ExitState | null>(null);
  const [passCounter, setPassCounter] = useState(0);

  const { entries, timelineKey, appendEntry } = useTimeline(MAX_TIMELINE_ENTRIES);
  const pendingAssistantMessageRef = useRef<TimelinePayload<'assistant-message'> | null>(null);

  const flushPendingAssistantMessage = useCallback((): void => {
    const pending = pendingAssistantMessageRef.current;
    if (!pending) {
      return;
    }
    appendEntry('assistant-message', pending);
    pendingAssistantMessageRef.current = null;
  }, [appendEntry]);

  const appendStatus = useCallback(
    (status: TimelinePayload<'status'>): void => {
      appendEntry('status', status);
    },
    [appendEntry],
  );

  const { debugEvents, handleDebugEvent } = useDebugPanel({
    limit: MAX_DEBUG_ENTRIES,
    appendStatus,
  });

  const { commandPanelEvents, commandPanelKey, handleCommandEvent, handleCommandInspectorCommand } =
    useCommandLog({
      limit: MAX_COMMAND_LOG_ENTRIES,
      appendCommandResult: appendEntry,
      appendStatus,
    });

  const { handleHistoryCommand } = useHistoryCommand({
    getRuntime: () => runtimeRef.current,
    appendStatus,
  });

  const safeSetExitState = useCallback((next: ExitState): void => {
    setExitState((prev) => prev ?? next);
  }, []);

  const handleAssistantMessage = useCallback(
    (event: AssistantMessageRuntimeEvent): void => {
      flushPendingAssistantMessage();
      const eventId = event.__id;
      if (typeof eventId !== 'string') {
        throw new TypeError('Assistant runtime event expected string "__id".');
      }
      const rawMessage = event.payload.message;
      pendingAssistantMessageRef.current = { message: rawMessage, eventId };
    },
    [flushPendingAssistantMessage],
  );

  const handleStatusEvent = useCallback(
    (event: StatusRuntimeEvent | StatusLikePayload): void => {
      const status = normalizeStatus(event);
      if (!status) {
        return;
      }
      appendStatus(status);
    },
    [appendStatus],
  );

  const slashCommandHandlers = useMemo(() => {
    const handlers = new Map<string, SlashCommandHandler>();
    handlers.set('history', handleHistoryCommand);
    handlers.set('command', handleCommandInspectorCommand);
    return handlers;
  }, [handleCommandInspectorCommand, handleHistoryCommand]);

  const routeSlashCommand = useSlashCommandRouter(slashCommandHandlers);

  const checkAndResetPlanIfCompleted = useCallback((): void => {
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
  }, [planProgress]);

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
          level: 'error',
          message: 'Slash command processing failed.',
          details: error instanceof Error ? error.message : String(error),
        });
      }

      if (!handledLocally) {
        checkAndResetPlanIfCompleted();

        try {
          runtimeRef.current?.submitPrompt?.(submission);
        } catch (error) {
          handleStatusEvent({
            level: 'error',
            message: 'Failed to submit input.',
            details: error instanceof Error ? error.message : String(error),
          });
        }

        setInputRequest(null);
        return;
      }
      // Slash commands keep the runtime waiting for further input.
    },
    [appendEntry, handleStatusEvent, checkAndResetPlanIfCompleted, routeSlashCommand],
  );

  const handleBannerEvent = useCallback(
    (event: BannerRuntimeEvent): void => {
      const { title, subtitle } = event.payload;
      appendEntry('banner', { title, subtitle });
    },
    [appendEntry],
  );

  const handlePassEvent = useCallback((event: PassRuntimeEvent): void => {
    const payload = event.payload;
    const numericPass = Number.isFinite(payload.pass)
      ? Number(payload.pass)
      : Number.isFinite(payload.index)
        ? Number(payload.index)
        : Number.isFinite(payload.value)
          ? Number(payload.value)
          : null;
    setPassCounter(numericPass && numericPass > 0 ? Math.floor(numericPass) : 0);
  }, []);

  const handlePlanEvent = useCallback((event: PlanRuntimeEvent): void => {
    setPlan(Array.isArray(event.payload.plan) ? cloneValue(event.payload.plan) : []);
  }, []);

  const handlePlanProgressEvent = useCallback((event: PlanProgressRuntimeEvent): void => {
    setPlanProgress({
      seen: true,
      value: event.payload.progress ? (cloneValue(event.payload.progress) as PlanProgress) : null,
    });
  }, []);

  const handleContextUsageEvent = useCallback((event: ContextUsageRuntimeEvent): void => {
    setContextUsage(
      event.payload.usage ? (cloneValue(event.payload.usage) as ContextUsage) : null,
    );
  }, []);

  const handleThinkingEvent = useCallback((event: ThinkingRuntimeEvent): void => {
    setThinking(event.payload.state === 'start');
  }, []);

  const handleErrorEvent = useCallback(
    (event: ErrorRuntimeEvent): void => {
      const payload = event.payload;
      const baseMessage =
        typeof payload.message === 'string' && payload.message.trim().length > 0
          ? payload.message
          : 'Agent error encountered.';
      const detailSource = payload.details ?? payload.raw ?? null;
      const details =
        detailSource === null || detailSource === undefined ? undefined : String(detailSource);
      handleStatusEvent({ level: 'error', message: baseMessage, details: details ?? null });
    },
    [handleStatusEvent],
  );

  const handleRequestInputEvent = useCallback(
    (event: RequestInputRuntimeEvent): void => {
      flushPendingAssistantMessage();
      const promptValue =
        typeof event.payload.prompt === 'string' && event.payload.prompt.length > 0
          ? event.payload.prompt
          : '▷';
      const metadata =
        event.payload.metadata === undefined || event.payload.metadata === null
          ? null
          : (cloneValue(event.payload.metadata) as InputRequestState['metadata']);
      setInputRequest({ prompt: promptValue, metadata });
    },
    [flushPendingAssistantMessage],
  );

  const handleRuntimeStatusEvent = useCallback(
    (event: StatusRuntimeEvent): void => {
      handleStatusEvent(event);
    },
    [handleStatusEvent],
  );

  const handleEvent = useRuntimeEventRouter({
    onAssistantMessage: handleAssistantMessage,
    onBanner: handleBannerEvent,
    onCommandResult: handleCommandEvent,
    onContextUsage: handleContextUsageEvent,
    onDebug: handleDebugEvent,
    onError: handleErrorEvent,
    onPass: handlePassEvent,
    onPlan: handlePlanEvent,
    onPlanProgress: handlePlanProgressEvent,
    onRequestInput: handleRequestInputEvent,
    onStatus: handleRuntimeStatusEvent,
    onThinking: handleThinkingEvent,
  });

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
          handleEvent(event);
        }
        await startPromise;
        if (!canceled) {
          safeSetExitState({ status: 'success' });
        }
      } catch (error) {
        if (!canceled) {
          safeSetExitState({ status: 'error', error: toRuntimeErrorPayload(error) });
        }
      }
    })();

    startPromise.catch((error) => {
      if (!canceled) {
        safeSetExitState({ status: 'error', error: toRuntimeErrorPayload(error) });
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

    flushPendingAssistantMessage();

    if (exitState.status === 'error') {
      onRuntimeError?.(exitState.error);
    } else {
      onRuntimeComplete?.();
    }

    exit();
  }, [exit, exitState, flushPendingAssistantMessage, onRuntimeComplete, onRuntimeError]);

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

  return (
    <Box flexDirection="column">
      <Timeline entries={entries} key={`timeline-${timelineKey}`} />
      {debugEvents.length > 0 ? <MemoDebugPanel events={debugEvents} heading="Debug" /> : null}
      {commandPanelEvents.length > 0 ? (
        <MemoDebugPanel
          events={commandPanelEvents}
          heading="Recent commands"
          key={`command-${commandPanelKey ?? 'command-inspector'}`}
        />
      ) : null}
      <AskHuman
        onSubmit={inputRequest ? handleSubmitPrompt : undefined}
        thinking={thinking}
        contextUsage={contextUsage}
        passCounter={passCounter}
        key="ask-human"
      />
      <MemoPlan plan={plan} key="plan" />
    </Box>
  );
}

export default CliApp;
