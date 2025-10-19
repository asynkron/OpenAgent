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
import { createPlanCommandPayload } from './cliApp/commandLogHelpers.js';
import { useHistoryCommand } from './cliApp/useHistoryCommand.js';
import { useTimeline } from './cliApp/useTimeline.js';
import type { PlanStep } from './planUtils.js';
import type { SchemaValidationFailedRuntimeEvent } from './cliApp/types.js';
import type { PlanProgress } from './progressUtils.js';
import type { ContextUsage } from '../status.js';

const MAX_TIMELINE_ENTRIES = 20;
const MAX_COMMAND_LOG_ENTRIES = 50;

const MemoPlan = memo(Plan);
const MemoAskHuman = memo(AskHuman);
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
  const getRuntime = useCallback(() => runtimeRef.current, []);

  const { exit } = useApp();
  const [plan, setPlan] = useState<PlanStep[]>([]);
  const [planProgressState, setPlanProgressState] = useState<PlanProgressState>({ seen: false, value: null });
  const planProgressRef = useRef<PlanProgressState>(planProgressState);
  const setPlanProgress = useCallback(
    (update: PlanProgressState | ((previous: PlanProgressState) => PlanProgressState)) => {
      setPlanProgressState((previous) => {
        const nextValue =
          typeof update === 'function'
            ? (update as (value: PlanProgressState) => PlanProgressState)(previous)
            : update;
        planProgressRef.current = nextValue;
        return nextValue;
      });
    },
    [setPlanProgressState],
  );
  if (planProgressRef.current !== planProgressState) {
    planProgressRef.current = planProgressState;
  }
  const [contextUsage, setContextUsage] = useState<ContextUsage | null>(null);
  const [thinking, setThinking] = useState(false);
  const [inputRequest, setInputRequest] = useState<InputRequestState | null>(null);
  const [exitState, setExitState] = useState<ExitState | null>(null);
  const [passCounter, setPassCounter] = useState(0);

  const { entries, timelineKey, appendEntry, upsertAssistantEntry, upsertCommandEntry } =
    useTimeline(MAX_TIMELINE_ENTRIES);

  const appendStatus = useCallback(
    (status: TimelinePayload<'status'>): void => {
      appendEntry('status', status);
    },
    [appendEntry],
  );

  const handleDebugEvent = useCallback(
    (event: DebugRuntimeEvent): void => {
      try {
        const payload = (event as unknown as { payload?: unknown }).payload as
          | { stage?: unknown; message?: unknown }
          | undefined;
        const stage = payload && typeof payload === 'object' ? (payload as { stage?: unknown }).stage : null;
        const message = payload && typeof payload === 'object' ? (payload as { message?: unknown }).message : null;
        if (stage === 'assistant-response-validation-error') {
          const summary = typeof message === 'string' && message.trim().length > 0
            ? message.trim()
            : 'Assistant response failed protocol validation.';
          appendStatus({ level: 'warn', message: `Auto-response triggered: ${summary}` });
        } else if (stage === 'assistant-response-schema-validation-error') {
          const summary =
            typeof message === 'string' && message.trim().length > 0
              ? message.trim()
              : 'Assistant response failed schema validation.';
          appendStatus({ level: 'warn', message: `Auto-response triggered: ${summary}` });
        }
      } catch {
        // ignore summary failures; fall back to default handling
      }
    },
    [appendStatus],
  );

  const { commandPanelEvents, commandPanelKey, handleCommandEvent, handleCommandInspectorCommand } =
    useCommandLog({
      limit: MAX_COMMAND_LOG_ENTRIES,
      upsertCommandResult: upsertCommandEntry,
      appendStatus,
    });

  const { handleHistoryCommand } = useHistoryCommand({
    getRuntime,
    appendStatus,
  });

  const safeSetExitState = useCallback((next: ExitState): void => {
    setExitState((prev) => prev ?? next);
  }, []);

  const handleAssistantMessage = useCallback(
    (event: AssistantMessageRuntimeEvent): void => {
      const eventIdValue = event.__id;
      if (typeof eventIdValue !== 'string') {
        throw new TypeError('Assistant runtime event expected string "__id".');
      }
      const normalizedId = eventIdValue.trim();
      if (!normalizedId) {
        throw new TypeError('Assistant runtime event expected string "__id".');
      }
      const rawSource =
        (event as unknown as { message?: unknown }).message ??
        (event.payload as unknown as { message?: unknown })?.message ??
        '';
      const rawMessage = Array.isArray(rawSource)
        ? rawSource.map((v) => String(v)).join('\n')
        : String(rawSource);
      upsertAssistantEntry({ message: rawMessage, eventId: normalizedId }, {
        final: event.final === true,
      });
    },
    [upsertAssistantEntry],
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
    const latestPlanProgress = planProgressRef.current;
    const progressValue = latestPlanProgress?.value ?? null;
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
      latestPlanProgress?.seen === true &&
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
  }, []);

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
    const snapshot = event.payload.plan;
    const toStringId = (value: unknown): string | null => {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
      }
      if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
      }
      return null;
    };
    const toWaitingFor = (value: unknown): Array<string | null | undefined> | undefined => {
      if (!Array.isArray(value)) {
        return undefined;
      }
      const mapped = value.map((v) => (typeof v === 'number' ? String(v) : typeof v === 'string' ? v : null));
      return mapped as Array<string | null | undefined>;
    };
    const nextPlan: PlanStep[] = Array.isArray(snapshot)
      ? ((snapshot as unknown as ReadonlyArray<Record<string, unknown>>).map((s) => ({
          id: toStringId((s as { id?: unknown }).id),
          title: ((): string | null => {
            const v = (s as { title?: unknown }).title;
            return typeof v === 'string' ? v : null;
          })(),
          status: ((): string | null => {
            const v = (s as { status?: unknown }).status;
            return typeof v === 'string' ? v : null;
          })(),
          priority: ((): number | string | null => {
            const v = (s as { priority?: unknown }).priority;
            if (typeof v === 'number' && Number.isFinite(v)) return v;
            if (typeof v === 'string') return v;
            return null;
          })(),
          command: ((): PlanStep['command'] => {
            const v = (s as { command?: unknown }).command;
            return v && typeof v === 'object' ? (cloneValue(v) as PlanStep['command']) : null;
          })(),
          waitingForId: toWaitingFor((s as { waitingForId?: unknown }).waitingForId),
        })) as PlanStep[])
      : [];
    setPlan(nextPlan);

    nextPlan.forEach((step) => {
      const placeholder = createPlanCommandPayload(step);
      if (placeholder) {
        upsertCommandEntry(placeholder);
      }
    });
  }, [upsertCommandEntry]);

  const handlePlanProgressEvent = useCallback((event: PlanProgressRuntimeEvent): void => {
    setPlanProgress({
      seen: true,
      value: event.payload.progress ? (cloneValue(event.payload.progress) as PlanProgress) : null,
    });
  }, [setPlanProgress]);

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
      const topLevelPrompt = (event as unknown as { prompt?: unknown }).prompt;
      const payloadPrompt = (event.payload as unknown as { prompt?: unknown })?.prompt;
      const chosenPrompt =
        typeof payloadPrompt === 'string'
          ? payloadPrompt
          : typeof topLevelPrompt === 'string'
            ? topLevelPrompt
            : '';
      const promptValue = chosenPrompt && chosenPrompt.length > 0 ? chosenPrompt : '▷';

      const topLevelMetadata = (event as unknown as { metadata?: unknown }).metadata;
      const payloadMetadata = (event.payload as unknown as { metadata?: unknown })?.metadata;
      const metadataSource = payloadMetadata ?? topLevelMetadata ?? null;
      const metadata =
        metadataSource === undefined || metadataSource === null
          ? null
          : (cloneValue(metadataSource) as InputRequestState['metadata']);
      setInputRequest({ prompt: promptValue, metadata });
    },
    [],
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
    onSchemaValidationFailed: (event: SchemaValidationFailedRuntimeEvent): void => {
      const payload = event.payload;
      const details = Array.isArray(payload.errors)
        ? payload.errors.map((e) => `${(e as { path?: string }).path ?? ''}: ${(e as { message?: string }).message ?? ''}`).join('; ')
        : null;
      handleStatusEvent({ level: 'error', message: payload.message, details });
    },
  });

  // Keep a stable handler to avoid restarting the runtime effect on every render.
  const handleEventRef = useRef<(event: RuntimeEvent) => void>(() => {});
  useEffect(() => {
    handleEventRef.current = handleEvent;
  }, [handleEvent]);

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
          handleEventRef.current(event);
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
  }, [runtime, safeSetExitState]);

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

  return (
    <Box flexDirection="column">
      <Timeline entries={entries} key={`timeline-${timelineKey}`} />
      {commandPanelEvents.length > 0 ? (
        <MemoDebugPanel
          events={commandPanelEvents}
          heading="Recent commands"
          key={`command-${commandPanelKey ?? 'command-inspector'}`}
        />
      ) : null}
      <MemoAskHuman
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
