import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Static, Text, useApp, useInput } from 'ink';

import { cancel as cancelActive } from '../../utils/cancellation.js';
import AgentResponse from './AgentResponse.js';
import AskHuman from './AskHuman.js';
import HumanMessage from './HumanMessage.js';
import Command from './Command.js';
import Plan from './Plan.js';
import DebugPanel from './DebugPanel.js';
import StatusMessage from './StatusMessage.js';

const MAX_TIMELINE_ENTRIES = 100;
const MAX_DEBUG_ENTRIES = 20;

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

/**
 * Main Ink container responsible for driving the CLI experience.
 */
export function CliApp({ runtime, onRuntimeComplete, onRuntimeError }) {
  const runtimeRef = useRef(runtime);
  const { exit } = useApp();
  const entryIdRef = useRef(0);
  const debugEventIdRef = useRef(0);
  const [plan, setPlan] = useState([]);
  const [planProgress, setPlanProgress] = useState({ seen: false, value: null });
  const [contextUsage, setContextUsage] = useState(null);
  const [thinking, setThinking] = useState(false);
  const [inputRequest, setInputRequest] = useState(null);
  const [entries, setEntries] = useState([]);
  const [timelineKey, setTimelineKey] = useState(0);
  const [debugEvents, setDebugEvents] = useState([]);
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

  const handleSubmitPrompt = useCallback(
    (value) => {
      const submission = value.trim();
      if (submission.length > 0) {
        appendEntry('human-message', { message: submission });
      }
      try {
        runtimeRef.current?.submitPrompt?.(submission);
      } catch (error) {
        handleStatusEvent({ level: 'error', message: 'Failed to submit input.', details: error });
      }
      setInputRequest(null);
    },
    [appendEntry, handleStatusEvent],
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

  const hasDebugEvents = debugEvents.length > 0;
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
    children.push(h(MemoDebugPanel, { events: debugEvents, key: 'debug' }));
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
