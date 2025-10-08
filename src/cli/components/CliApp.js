import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';

import { cancel as cancelActive } from '../../utils/cancellation.js';
import AgentResponse from './AgentResponse.js';
import AskHuman from './AskHuman.js';
import Command from './Command.js';
import Plan from './Plan.js';
import PlanProgress from './PlanProgress.js';
import DebugPanel from './DebugPanel.js';
import StatusMessage from './StatusMessage.js';
import ContextUsage from './ContextUsage.js';
import ThinkingIndicator from './ThinkingIndicator.js';

const MAX_TIMELINE_ENTRIES = 100;
const MAX_DEBUG_ENTRIES = 20;

const h = React.createElement;

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
  const [banner, setBanner] = useState(null);
  const [plan, setPlan] = useState([]);
  const [planProgress, setPlanProgress] = useState({ seen: false, value: null });
  const [contextUsage, setContextUsage] = useState(null);
  const [thinking, setThinking] = useState(false);
  const [inputRequest, setInputRequest] = useState(null);
  const [entries, setEntries] = useState([]);
  const [debugEvents, setDebugEvents] = useState([]);
  const [exitState, setExitState] = useState(null);

  const appendEntry = useCallback((type, payload) => {
    entryIdRef.current += 1;
    const id = entryIdRef.current;
    setEntries((prev) => {
      const next = [...prev, { id, type, payload }];
      if (next.length > MAX_TIMELINE_ENTRIES) {
        return next.slice(next.length - MAX_TIMELINE_ENTRIES);
      }
      return next;
    });
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
      appendEntry('assistant-message', { message: event.message ?? '' });
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
      const next = [...prev, formatted];
      if (next.length > MAX_DEBUG_ENTRIES) {
        return next.slice(next.length - MAX_DEBUG_ENTRIES);
      }
      return next;
    });
  }, []);

  const handleSubmitPrompt = useCallback(
    (value) => {
      try {
        runtimeRef.current?.submitPrompt?.(value);
      } catch (error) {
        handleStatusEvent({ level: 'error', message: 'Failed to submit input.', details: error });
      }
      setInputRequest(null);
    },
    [handleStatusEvent],
  );

  const handleEvent = useCallback(
    (event) => {
      if (!event || typeof event !== 'object') {
        return;
      }

      switch (event.type) {
        case 'banner':
          setBanner({ title: event.title, subtitle: event.subtitle });
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
        case 'plan':
          setPlan(Array.isArray(event.plan) ? event.plan : []);
          break;
        case 'plan-progress':
          setPlanProgress({ seen: true, value: event.progress || null });
          break;
        case 'context-usage':
          setContextUsage(event.usage || null);
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
          setInputRequest({ prompt: event.prompt ?? '▷', metadata: event.metadata || null });
          break;
        case 'debug':
          handleDebugEvent(event);
          break;
        default:
          break;
      }
    },
    [handleAssistantMessage, handleCommandEvent, handleDebugEvent, handleStatusEvent],
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
  const renderedBanner = useMemo(() => {
    if (!banner) {
      return null;
    }
    const elements = [];
    if (banner.title) {
      elements.push(h(Text, { color: 'blueBright', bold: true, key: 'title' }, banner.title));
    }
    if (banner.subtitle) {
      elements.push(h(Text, { dimColor: true, key: 'subtitle' }, banner.subtitle));
    }
    return h(Box, { flexDirection: 'column', marginBottom: 1 }, elements);
  }, [banner]);

  const children = [];
  if (renderedBanner) {
    children.push(renderedBanner);
  }

  children.push(h(Plan, { plan, key: 'plan' }));
  if (planProgress.seen) {
    children.push(h(PlanProgress, { progress: planProgress.value, key: 'plan-progress' }));
  }
  if (contextUsage) {
    children.push(h(ContextUsage, { usage: contextUsage, key: 'context-usage' }));
  }

  entries.forEach((entry) => {
    switch (entry.type) {
      case 'assistant-message':
        children.push(h(AgentResponse, { key: entry.id, message: entry.payload.message }));
        break;
      case 'command-result':
        children.push(
          h(Command, {
            key: entry.id,
            command: entry.payload.command,
            result: entry.payload.result,
            preview: entry.payload.preview,
            execution: entry.payload.execution,
          }),
        );
        break;
      case 'status':
        children.push(h(StatusMessage, { key: entry.id, status: entry.payload }));
        break;
      default:
        break;
    }
  });

  if (hasDebugEvents) {
    children.push(h(DebugPanel, { events: debugEvents, key: 'debug' }));
  }

  children.push(h(ThinkingIndicator, { active: thinking, key: 'thinking' }));

  if (inputRequest) {
    children.push(
      h(AskHuman, {
        prompt: inputRequest.prompt,
        onSubmit: handleSubmitPrompt,
        key: 'ask-human',
      }),
    );
  }

  return h(Box, { flexDirection: 'column' }, children);
}

export default CliApp;
