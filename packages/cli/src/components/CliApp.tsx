// @ts-nocheck
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Static, Text, useApp, useInput } from 'ink';

import { cancel as cancelActive } from '@asynkron/openagent-core';
import AgentResponse from './AgentResponse.js';
import AskHuman from './AskHuman.js';
import HumanMessage from './HumanMessage.js';
import Command from './Command.js';
import Plan from './Plan.js';
import DebugPanel from './DebugPanel.js';
import StatusMessage from './StatusMessage.js';
import {
  appendWithLimit,
  formatDebugPayload,
  summarizeAutoResponseDebug,
} from './cliApp/logging.js';
import { resolveHistoryFilePath, writeHistorySnapshot } from './cliApp/history.js';

const MAX_TIMELINE_ENTRIES = 20;
const MAX_DEBUG_ENTRIES = 20;
const MAX_COMMAND_LOG_ENTRIES = 50;

const MemoPlan = React.memo(Plan);
const MemoAgentResponse = React.memo(AgentResponse);
const MemoHumanMessage = React.memo(HumanMessage);
const MemoCommand = React.memo(Command);
const MemoStatusMessage = React.memo(StatusMessage);
const MemoDebugPanel = React.memo(DebugPanel);

const Timeline = React.memo(function Timeline({ entries }) {
  if (!entries || entries.length === 0) {
    return null;
  }

  return (
    <Box width="100%" alignSelf="stretch" flexDirection="column" flexGrow={1}>
      <Static
        items={entries}
        itemKey={(item) => item.id}
        style={{ width: '100%', flexGrow: 1 }}
      >
        {(entry) => {
          let content = null;

          switch (entry.type) {
            case 'assistant-message':
              content = (
                <MemoAgentResponse
                  key={entry.payload.eventId ?? entry.id}
                  message={entry.payload.message}
                />
              );
              break;
            case 'human-message':
              content = <MemoHumanMessage message={entry.payload.message} />;
              break;
            case 'command-result':
              content = (
                <MemoCommand
                  command={entry.payload.command}
                  result={entry.payload.result}
                  preview={entry.payload.preview}
                  execution={entry.payload.execution}
                />
              );
              break;
            case 'banner': {
              const hasTitle = Boolean(entry.payload?.title);
              const hasSubtitle = Boolean(entry.payload?.subtitle);
              if (!hasTitle && !hasSubtitle) {
                break;
              }

              content = (
                <Box flexDirection="column" marginBottom={1} width="100%" alignSelf="stretch">
                  {hasTitle ? (
                    <Text color="blueBright" bold>
                      {entry.payload.title}
                    </Text>
                  ) : null}
                  {hasSubtitle ? (
                    <Text dimColor>{entry.payload.subtitle}</Text>
                  ) : null}
                </Box>
              );
              break;
            }
            case 'status':
              content = <MemoStatusMessage status={entry.payload} />;
              break;
            default:
              break;
          }

          if (!content) {
            return null;
          }

          return (
            <Box
              key={entry.id}
              width="100%"
              flexGrow={1}
              alignSelf="stretch"
              flexDirection="column"
            >
              {content}
            </Box>
          );
        }}
      </Static>
    </Box>
  );
});

function normalizeStatus(event) {
  const message = event.message ?? '';
  if (!message) {
    return null;
  }
  const normalized = {
    level: event.level ?? 'info',
    message,
  };
  if (event.details !== undefined && event.details !== null) {
    normalized.details = String(event.details);
  }
  return normalized;
}

function cloneValue(value) {
  if (value === undefined || value === null) {
    return value;
  }

  if (typeof value !== 'object') {
    return value;
  }

  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch (_error) {
      // Fall through to JSON fallback when structured cloning fails (e.g., non-cloneable values).
    }
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_error) {
    // As a last resort, return the original reference so we at least render something.
    return value;
  }
}

function parsePositiveInteger(value, defaultValue = 1) {
  if (value === undefined || value === null) {
    return defaultValue;
  }

  const normalized = typeof value === 'number' ? value : Number.parseInt(String(value).trim(), 10);

  if (!Number.isFinite(normalized) || normalized <= 0) {
    return defaultValue;
  }

  return Math.floor(normalized);
}

/**
 * Main Ink container responsible for driving the CLI experience.
 */
export function CliApp({ runtime, onRuntimeComplete, onRuntimeError }) {
  const runtimeRef = useRef(runtime);
  const { exit } = useApp();
  const entryIdRef = useRef(0);
  const debugEventIdRef = useRef(0);
  const commandLogIdRef = useRef(0);
  const [plan, setPlan] = useState([]);
  const [planProgress, setPlanProgress] = useState({ seen: false, value: null });
  const [contextUsage, setContextUsage] = useState(null);
  const [thinking, setThinking] = useState(false);
  const [inputRequest, setInputRequest] = useState(null);
  const [entries, setEntries] = useState([]);
  const [timelineKey, setTimelineKey] = useState(0);
  const [debugEvents, setDebugEvents] = useState([]);
  const [commandLog, setCommandLog] = useState([]);
  const [commandInspector, setCommandInspector] = useState(null);
  const [exitState, setExitState] = useState(null);
  const [passCounter, setPassCounter] = useState(0);

  const appendEntry = useCallback((type, payload) => {
    const id = ++entryIdRef.current;
    let trimmed = false;
    setEntries((prev) => {
      const result = appendWithLimit(prev, { id, type, payload }, MAX_TIMELINE_ENTRIES);
      trimmed = result.trimmed;
      return result.next;
    });
    if (trimmed) {
      setTimelineKey((value) => value + 1);
    }
  }, []);

  const safeSetExitState = useCallback((next) => {
    setExitState((prev) => prev ?? next);
  }, []);

  const handleCommandEvent = useCallback(
    (event) => {
      const commandPayload = cloneValue(event.command ?? null);
      const resultPayload = cloneValue(event.result ?? null);
      const previewPayload = cloneValue(event.preview ?? {});
      const executionPayload = cloneValue(event.execution ?? null);

      appendEntry('command-result', {
        command: commandPayload,
        result: resultPayload,
        preview: previewPayload || {},
        execution: executionPayload,
      });
      if (commandPayload) {
        setCommandLog((prev) => {
          const entry = {
            id: ++commandLogIdRef.current,
            command: cloneValue(commandPayload),
            receivedAt: Date.now(),
          };
          return appendWithLimit(prev, entry, MAX_COMMAND_LOG_ENTRIES).next;
        });
      }
    },
    [appendEntry],
  );

  const handleAssistantMessage = useCallback(
    (event) => {
      const eventId =
        typeof event.__id === 'string' || typeof event.__id === 'number' ? event.__id : null;
      appendEntry('assistant-message', { message: event.message ?? '', eventId });
    },
    [appendEntry],
  );

  const handleStatusEvent = useCallback(
    (event) => {
      const status = normalizeStatus(event);
      if (!status) {
        return;
      }
      appendEntry('status', status);
    },
    [appendEntry],
  );

  const handleDebugEvent = useCallback(
    (event) => {
      setDebugEvents((prev) => {
        const formatted = formatDebugPayload(event.payload);
        if (!formatted) {
          return prev;
        }

        const entry = {
          id:
            typeof event.id === 'string' || typeof event.id === 'number'
              ? event.id
              : ++debugEventIdRef.current,
          content: formatted,
        };

        return appendWithLimit(prev, entry, MAX_DEBUG_ENTRIES).next;
      });
      const summary = summarizeAutoResponseDebug(event.payload);
      if (summary) {
        appendEntry('status', { level: 'warn', message: summary });
      }
    },
    [appendEntry],
  );

  const handleSlashCommand = useCallback(
    async (submission) => {
      if (typeof submission !== 'string' || !submission.trim().startsWith('/')) {
        return false;
      }

      const normalized = submission.trim();
      const withoutPrefix = normalized.slice(1).trim();

      if (!withoutPrefix) {
        return false;
      }

      const [rawName, ...restParts] = withoutPrefix.split(/\s+/u);
      const commandName = rawName.toLowerCase();
      const rest = restParts.join(' ').trim();

      switch (commandName) {
        case 'history': {
          const activeRuntime = runtimeRef.current;
          if (!activeRuntime || typeof activeRuntime.getHistorySnapshot !== 'function') {
            handleStatusEvent({
              level: 'error',
              message: 'History snapshot is unavailable for this session.',
            });
            return true;
          }

          let history;
          try {
            history = activeRuntime.getHistorySnapshot();
          } catch (error) {
            handleStatusEvent({
              level: 'error',
              message: 'Failed to read history from the runtime.',
              details: error,
            });
            return true;
          }

          try {
            const targetPath = await writeHistorySnapshot({ history, filePath: rest });
            handleStatusEvent({
              level: 'info',
              message: `Saved history to ${targetPath}.`,
            });
          } catch (error) {
            handleStatusEvent({
              level: 'error',
              message: 'Failed to write history file.',
              details: error,
            });
          }
          return true;
        }
        case 'command': {
          if (!commandLog || commandLog.length === 0) {
            handleStatusEvent({
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
            level: 'info',
            message:
              safeCount === 1
                ? 'Showing the most recent command payload.'
                : `Showing the ${safeCount} most recent command payloads.`,
          });
          return true;
        }
        default:
          return false;
      }
    },
    [commandLog, handleStatusEvent],
  );

  const handleSubmitPrompt = useCallback(
    async (value) => {
      const submission = value.trim();
      if (submission.length > 0) {
        appendEntry('human-message', { message: submission });
      }

      let handledLocally = false;
      try {
        handledLocally = await handleSlashCommand(submission);
      } catch (error) {
        handledLocally = true;
        handleStatusEvent({
          level: 'error',
          message: 'Slash command processing failed.',
          details: error,
        });
      }

      if (!handledLocally) {
        const progressValue = planProgress?.value ?? null;
        const planCompleted =
          planProgress?.seen === true &&
          progressValue &&
          Number.isFinite(progressValue.totalSteps) &&
          progressValue.totalSteps > 0 &&
          Number.isFinite(progressValue.completedSteps) &&
          progressValue.completedSteps >= progressValue.totalSteps;

        if (planCompleted) {
          // Once every leaf step is marked complete, clear the rendered plan so the
          // next human turn starts with a fresh slate.
          setPlan((prevPlan) => (Array.isArray(prevPlan) && prevPlan.length === 0 ? prevPlan : []));
          setPlanProgress((prev) => {
            if (!prev?.seen && (prev?.value === null || typeof prev?.value === 'undefined')) {
              return prev;
            }
            return { seen: false, value: null };
          });
        }

        try {
          runtimeRef.current?.submitPrompt?.(submission);
        } catch (error) {
          handleStatusEvent({ level: 'error', message: 'Failed to submit input.', details: error });
        }
        setInputRequest(null);
        return;
      }

      // When a slash command is handled locally, the runtime is still waiting for
      // input. Keep the current request active so the next human prompt is routed
      // to OpenAI instead of being treated as another local command.
    },
    [appendEntry, handleSlashCommand, handleStatusEvent, planProgress],
  );

  const handleEvent = useCallback(
    (event) => {
      if (!event || typeof event !== 'object') {
        return;
      }

      switch (event.type) {
        case 'banner':
          appendEntry('banner', { title: event.title ?? null, subtitle: event.subtitle ?? null });
          break;
        case 'status':
          handleStatusEvent(event);
          break;
        case 'pass': {
          const numericPass = Number.isFinite(event.pass)
            ? event.pass
            : Number.isFinite(event.index)
              ? event.index
              : Number.isFinite(event.value)
                ? event.value
                : null;
          setPassCounter(numericPass && numericPass > 0 ? Math.floor(numericPass) : 0);
          break;
        }
        case 'thinking':
          setThinking(event.state === 'start');
          break;
        case 'assistant-message':
          handleAssistantMessage(event);
          break;
        case 'plan':
          setPlan(Array.isArray(event.plan) ? cloneValue(event.plan) : []);
          break;
        case 'plan-progress':
          setPlanProgress({
            seen: true,
            value: event.progress ? cloneValue(event.progress) : null,
          });
          break;
        case 'context-usage':
          setContextUsage(event.usage ? cloneValue(event.usage) : null);
          break;
        case 'command-result':
          handleCommandEvent(event);
          break;
        case 'error':
          handleStatusEvent({
            level: 'error',
            message: event.message || 'Agent error encountered.',
            details: event.details || event.raw,
          });
          break;
        case 'request-input':
          setInputRequest({
            prompt: event.prompt ?? '▷',
            metadata:
              event.metadata === undefined || event.metadata === null
                ? null
                : cloneValue(event.metadata),
          });
          break;
        case 'debug':
          handleDebugEvent(event);
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
          handleEvent(event);
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
  }, [handleEvent, safeSetExitState]);

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
    if (key.ctrl && (key.name === 'c' || input === 'c')) {
      runtimeRef.current?.cancel?.({ reason: 'ctrl-c' });
      safeSetExitState({ status: 'success' });
    }
  });

  const commandPanelEvents = useMemo(() => {
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

  const sections = [
    <Timeline entries={entries} key={`timeline-${timelineKey}`} />,
    debugEvents.length > 0 ? (
      <MemoDebugPanel events={debugEvents} heading="Debug" key="debug" />
    ) : null,
    commandPanelEvents.length > 0 ? (
      <MemoDebugPanel
        events={commandPanelEvents}
        heading="Recent commands"
        key={`command-${commandInspector?.token ?? 'command-inspector'}`}
      />
    ) : null,
    <AskHuman
      prompt={inputRequest?.prompt}
      onSubmit={inputRequest ? handleSubmitPrompt : undefined}
      thinking={thinking}
      contextUsage={contextUsage}
      passCounter={passCounter}
      key="ask-human"
    />,
    <MemoPlan plan={plan} progress={planProgress.value} key="plan" />,
  ].filter(Boolean);

  return <Box flexDirection="column">{sections}</Box>;
}

export default CliApp;
