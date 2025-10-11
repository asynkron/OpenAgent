import { promises as fs } from 'node:fs';
import path from 'node:path';

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

const MAX_TIMELINE_ENTRIES = 100;
const MAX_DEBUG_ENTRIES = 20;
const MAX_COMMAND_LOG_ENTRIES = 50;

const h = React.createElement;

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

  return h(
    Box,
    { width: '100%', alignSelf: 'stretch', flexDirection: 'column', flexGrow: 1 },
    h(
      Static,
      {
        items: entries,
        itemKey: (item) => item.payload?.eventId ?? item.id,
        style: { width: '100%', flexGrow: 1 },
      },
      (entry) => {
        let content = null;

        switch (entry.type) {
          case 'assistant-message':
            content = h(MemoAgentResponse, {
              key: entry.payload.eventId ?? entry.id,
              message: entry.payload.message,
            });
            break;
          case 'human-message':
            content = h(MemoHumanMessage, { message: entry.payload.message });
            break;
          case 'command-result':
            content = h(MemoCommand, {
              command: entry.payload.command,
              result: entry.payload.result,
              preview: entry.payload.preview,
              execution: entry.payload.execution,
            });
            break;
          case 'banner': {
            const elements = [];
            if (entry.payload?.title) {
              elements.push(
                h(Text, { color: 'blueBright', bold: true, key: 'title' }, entry.payload.title),
              );
            }
            if (entry.payload?.subtitle) {
              elements.push(h(Text, { dimColor: true, key: 'subtitle' }, entry.payload.subtitle));
            }
            if (elements.length === 0) {
              break;
            }
            content = h(
              Box,
              { flexDirection: 'column', marginBottom: 1, width: '100%', alignSelf: 'stretch' },
              elements,
            );
            break;
          }
          case 'status':
            content = h(MemoStatusMessage, { status: entry.payload });
            break;
          default:
            break;
        }

        if (!content) {
          return null;
        }

        return h(
          Box,
          {
            key: entry.id,
            width: '100%',
            flexGrow: 1,
            alignSelf: 'stretch',
            flexDirection: 'column',
          },
          content,
        );
      },
    ),
  );
});

function deepEqual(a, b) {
  if (a === b) {
    return true;
  }

  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    return false;
  }

  if (Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }

  if (Array.isArray(a)) {
    if (a.length !== b.length) {
      return false;
    }
    for (let index = 0; index < a.length; index += 1) {
      if (!deepEqual(a[index], b[index])) {
        return false;
      }
    }
    return true;
  }

  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);

  if (aKeys.length !== bKeys.length) {
    return false;
  }

  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, key) || !deepEqual(a[key], b[key])) {
      return false;
    }
  }

  return true;
}

function formatDebugPayload(payload) {
  if (typeof payload === 'string') {
    return payload;
  }
  try {
    return JSON.stringify(payload, null, 2);
  } catch (error) {
    return String(payload);
  }
}

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

function formatTimestampForFilename(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

function resolveHistoryFilePath(rawPath) {
  if (typeof rawPath === 'string' && rawPath.trim().length > 0) {
    return path.resolve(process.cwd(), rawPath.trim());
  }
  const timestamp = formatTimestampForFilename();
  const fallbackName = `openagent-history-${timestamp}.json`;
  return path.resolve(process.cwd(), fallbackName);
}

async function writeHistorySnapshot({ history, filePath }) {
  const targetPath = resolveHistoryFilePath(filePath);
  const directory = path.dirname(targetPath);
  await fs.mkdir(directory, { recursive: true });

  let serialized;
  try {
    serialized = JSON.stringify(history ?? [], null, 2);
  } catch (error) {
    const wrapped = error instanceof Error ? error : new Error(String(error));
    wrapped.message = `Failed to serialize history: ${wrapped.message}`;
    throw wrapped;
  }

  await fs.writeFile(targetPath, `${serialized}\n`, 'utf8');
  return targetPath;
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

  const appendEntry = useCallback((type, payload) => {
    entryIdRef.current += 1;
    const id = entryIdRef.current;
    let trimmed = false;
    setEntries((prev) => {
      const next = [...prev, { id, type, payload }];
      if (next.length > MAX_TIMELINE_ENTRIES) {
        trimmed = true;
        return next.slice(next.length - MAX_TIMELINE_ENTRIES);
      }
      return next;
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
      appendEntry('command-result', {
        command: event.command,
        result: event.result,
        preview: event.preview || {},
        execution: event.execution,
      });
      const commandPayload = event.command ?? null;
      if (commandPayload) {
        setCommandLog((prev) => {
          commandLogIdRef.current += 1;
          const entry = {
            id: commandLogIdRef.current,
            command: commandPayload,
            receivedAt: Date.now(),
          };
          const next = [...prev, entry];
          if (next.length > MAX_COMMAND_LOG_ENTRIES) {
            return next.slice(next.length - MAX_COMMAND_LOG_ENTRIES);
          }
          return next;
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

  const handleDebugEvent = useCallback((event) => {
    setDebugEvents((prev) => {
      const formatted = formatDebugPayload(event.payload);
      if (!formatted) {
        return prev;
      }

      debugEventIdRef.current += 1;
      const entry = {
        id:
          typeof event.id === 'string' || typeof event.id === 'number'
            ? event.id
            : debugEventIdRef.current,
        content: formatted,
      };

      const next = [...prev, entry];
      if (next.length > MAX_DEBUG_ENTRIES) {
        return next.slice(next.length - MAX_DEBUG_ENTRIES);
      }
      return next;
    });
  }, []);

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
    [appendEntry, handleSlashCommand, handleStatusEvent],
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
        case 'thinking':
          setThinking(event.state === 'start');
          break;
        case 'assistant-message':
          handleAssistantMessage(event);
          break;
        case 'plan': {
          const nextPlan = Array.isArray(event.plan) ? event.plan : [];
          setPlan((prevPlan) => (deepEqual(prevPlan, nextPlan) ? prevPlan : nextPlan));
          break;
        }
        case 'plan-progress': {
          const nextPlanProgress = { seen: true, value: event.progress || null };
          setPlanProgress((prev) => (deepEqual(prev, nextPlanProgress) ? prev : nextPlanProgress));
          break;
        }
        case 'context-usage': {
          const nextContextUsage = event.usage || null;
          setContextUsage((prev) => (deepEqual(prev, nextContextUsage) ? prev : nextContextUsage));
          break;
        }
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
          setInputRequest({ prompt: event.prompt ?? '▷', metadata: event.metadata || null });
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
      } catch (error) {
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
    if (!commandInspector) {
      return [];
    }

    if (!commandLog || commandLog.length === 0) {
      return [];
    }

    const requested = parsePositiveInteger(commandInspector.requested, 1);
    const safeCount = Math.max(1, Math.min(commandLog.length, requested));
    const recent = commandLog.slice(commandLog.length - safeCount).reverse();

    return recent.map((entry) => ({
      id: entry.id,
      content: formatDebugPayload(entry.command),
    }));
  }, [commandInspector, commandLog]);

  const hasDebugEvents = debugEvents.length > 0;
  const showCommandInspector = commandPanelEvents.length > 0;
  const commandInspectorKey = commandInspector?.token ?? 'command-inspector';
  const children = [];

  children.push(
    h(MemoPlan, {
      plan,
      progress: planProgress.value,
      key: 'plan',
    }),
  );

  children.push(h(Timeline, { entries, key: `timeline-${timelineKey}` }));

  if (hasDebugEvents) {
    children.push(h(MemoDebugPanel, { events: debugEvents, heading: 'Debug', key: 'debug' }));
  }

  if (showCommandInspector) {
    children.push(
      h(MemoDebugPanel, {
        events: commandPanelEvents,
        heading: 'Recent commands',
        key: `command-${commandInspectorKey}`,
      }),
    );
  }

  children.push(
    h(AskHuman, {
      prompt: inputRequest?.prompt,
      onSubmit: inputRequest ? handleSubmitPrompt : undefined,
      thinking,
      contextUsage,
      key: 'ask-human',
    }),
  );

  return h(Box, { flexDirection: 'column' }, children);
}

export default CliApp;
