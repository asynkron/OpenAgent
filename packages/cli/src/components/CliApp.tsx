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
import {
  type AgentRuntimeLike,
  type AssistantMessageRuntimeEvent,
  type CliAppProps,
  type CommandResultRuntimeEvent,
  type DebugRuntimeEvent,
  type ExitState,
  type InputRequestState,
  type PlanProgressState,
  type RuntimeEvent,
  type SlashCommandHandler,
  type TimelinePayload,
  type StatusRuntimeEvent,
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
      const rawMessage = event.message;
      const message =
        rawMessage === undefined || rawMessage === null
          ? ''
          : typeof rawMessage === 'string'
            ? rawMessage
            : cloneValue(rawMessage);
      pendingAssistantMessageRef.current = { message, eventId };
    },
    [flushPendingAssistantMessage],
  );

  const handleStatusEvent = useCallback(
    (event: StatusRuntimeEvent | { message?: string; level?: string; details?: unknown }): void => {
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
          type: 'status',
          level: 'error',
          message: 'Slash command processing failed.',
          details: error,
        });
      }

      if (!handledLocally) {
        checkAndResetPlanIfCompleted();

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
    [appendEntry, handleStatusEvent, checkAndResetPlanIfCompleted, routeSlashCommand],
  );

  const handleBannerEvent = useCallback(
    (event: RuntimeEvent): void => {
      const bannerEvent = event as any;
      appendEntry('banner', {
        title: typeof bannerEvent.title === 'string' ? bannerEvent.title : null,
        subtitle: typeof bannerEvent.subtitle === 'string' ? bannerEvent.subtitle : null,
      });
    },
    [appendEntry],
  );

  const handlePassEvent = useCallback((event: RuntimeEvent): void => {
    const passEvent = event as any;
    const numericPass = Number.isFinite(passEvent.pass)
      ? Number(passEvent.pass)
      : Number.isFinite(passEvent.index)
        ? Number(passEvent.index)
        : Number.isFinite(passEvent.value)
          ? Number(passEvent.value)
          : null;
    setPassCounter(numericPass && numericPass > 0 ? Math.floor(numericPass) : 0);
  }, []);

  const handlePlanEvent = useCallback((event: RuntimeEvent): void => {
    const planEvent = event as any;
    setPlan(Array.isArray(planEvent.plan) ? cloneValue(planEvent.plan) : []);
  }, []);

  const handlePlanProgressEvent = useCallback((event: RuntimeEvent): void => {
    const progressEvent = event as any;
    setPlanProgress({
      seen: true,
      value: progressEvent.progress ? (cloneValue(progressEvent.progress) as PlanProgress) : null,
    });
  }, []);

  const handleContextUsageEvent = useCallback((event: RuntimeEvent): void => {
    const usageEvent = event as any;
    setContextUsage(usageEvent.usage ? (cloneValue(usageEvent.usage) as ContextUsage) : null);
  }, []);

  const handleErrorEvent = useCallback(
    (event: RuntimeEvent): void => {
      const errorEvent = event as any;
      handleStatusEvent({
        type: 'status',
        level: 'error',
        message:
          typeof errorEvent.message === 'string' && errorEvent.message.trim().length > 0
            ? errorEvent.message
            : 'Agent error encountered.',
        details: errorEvent.details ?? errorEvent.raw,
      });
    },
    [handleStatusEvent],
  );

  const handleRequestInputEvent = useCallback(
    (event: RuntimeEvent): void => {
      flushPendingAssistantMessage();
      const inputEvent = event as any;
      setInputRequest({
        prompt: typeof inputEvent.prompt === 'string' ? inputEvent.prompt : '▷',
        metadata:
          inputEvent.metadata === undefined || inputEvent.metadata === null
            ? null
            : cloneValue(inputEvent.metadata),
      });
    },
    [flushPendingAssistantMessage],
  );

  const handleEvent = useCallback(
    (event: RuntimeEvent) => {
      if (!event || typeof event !== 'object') {
        return;
      }

      switch (event.type) {
        case 'banner':
          handleBannerEvent(event);
          break;
        case 'status':
          handleStatusEvent(event as StatusRuntimeEvent);
          break;
        case 'pass':
          handlePassEvent(event);
          break;
        case 'thinking':
          setThinking(event.state === 'start');
          break;
        case 'assistant-message':
          handleAssistantMessage(event as AssistantMessageRuntimeEvent);
          break;
        case 'plan':
          handlePlanEvent(event);
          break;
        case 'plan-progress':
          handlePlanProgressEvent(event);
          break;
        case 'context-usage':
          handleContextUsageEvent(event);
          break;
        case 'command-result':
          handleCommandEvent(event as CommandResultRuntimeEvent);
          break;
        case 'error':
          handleErrorEvent(event);
          break;
        case 'request-input':
          handleRequestInputEvent(event);
          break;
        case 'debug':
          handleDebugEvent(event as DebugRuntimeEvent);
          break;
        default:
          break;
      }
    },
    [
      handleBannerEvent,
      handleStatusEvent,
      handlePassEvent,
      handleAssistantMessage,
      handlePlanEvent,
      handlePlanProgressEvent,
      handleContextUsageEvent,
      handleCommandEvent,
      handleErrorEvent,
      handleRequestInputEvent,
      handleDebugEvent,
    ],
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
        contextUsage={contextUsage as any}
        passCounter={passCounter}
        key="ask-human"
      />
      <MemoPlan plan={plan} key="plan" />
    </Box>
  );
}

export default CliApp;
