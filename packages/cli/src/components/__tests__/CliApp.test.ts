/* eslint-env jest */
import React from 'react';
import { describe, expect, jest, test } from '@jest/globals';
import { render } from 'ink-testing-library';
import { waitForInkUpdates } from '../test-utils/InkTextArea.js';

const cancelMock = jest.fn();
let latestAskHumanProps = null;

jest.unstable_mockModule('@asynkron/openagent-core', () => ({
  cancel: cancelMock,
  PlanStatus: {
    Pending: 'pending',
    Running: 'running',
    Completed: 'completed',
    Failed: 'failed',
    Abandoned: 'abandoned',
  },
  isTerminalStatus: (status) => status === 'completed' || status === 'failed' || status === 'abandoned',
}));

jest.unstable_mockModule('../AskHuman.tsx', () => ({
  __esModule: true,
  default: (props) => {
    latestAskHumanProps = props;
    return null;
  },
}));

const { default: CliApp } = await import('../CliApp.tsx');

function createRuntimeHarness() {
  const queue = [];
  const waiters = [];
  let closed = false;
  let counter = 0;

  const iterator = {
    async next() {
      if (closed) {
        return { value: undefined, done: true };
      }
      if (queue.length > 0) {
        return { value: queue.shift(), done: false };
      }
      return new Promise((resolve) => {
        waiters.push(resolve);
      });
    },
    return() {
      closed = true;
      while (waiters.length > 0) {
        const resolve = waiters.shift();
        resolve({ value: undefined, done: true });
      }
      return Promise.resolve({ value: undefined, done: true });
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };

  return {
    start: jest.fn(() => Promise.resolve()),
    submitPrompt: jest.fn(),
    cancel: jest.fn(),
    outputs: iterator,
    emit(event) {
      if (closed) {
        return;
      }
      const resolvedEvent =
        event && typeof event === 'object' ? { ...event } : { type: 'unknown', event };
      if (typeof resolvedEvent.__id === 'undefined') {
        resolvedEvent.__id = `event-${counter++}`;
      }
      if (waiters.length > 0) {
        const resolve = waiters.shift();
        resolve({ value: resolvedEvent, done: false });
        return;
      }
      queue.push(resolvedEvent);
    },
    close() {
      if (closed) {
        return;
      }
      closed = true;
      while (waiters.length > 0) {
        const resolve = waiters.shift();
        resolve({ value: undefined, done: true });
      }
    },
  };
}

async function flush() {
  await waitForInkUpdates();
}

describe('CliApp slash command handling', () => {
  test('keeps the input request active after handling a local slash command', async () => {
    latestAskHumanProps = null;
    const runtime = createRuntimeHarness();
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = render(React.createElement(CliApp, { runtime }));

    try {
      runtime.emit({ type: 'request-input', prompt: '▷', metadata: { scope: 'user-input' } });
      await flush();

      expect(typeof latestAskHumanProps?.onSubmit).toBe('function');

      await latestAskHumanProps.onSubmit('/command 1');
      await flush();

      expect(runtime.submitPrompt).not.toHaveBeenCalled();
      expect(typeof latestAskHumanProps?.onSubmit).toBe('function');

      await latestAskHumanProps.onSubmit('hello world');
      await flush();

      expect(runtime.submitPrompt).toHaveBeenCalledTimes(1);
      expect(runtime.submitPrompt).toHaveBeenCalledWith('hello world');
    } finally {
      unmount();
      runtime.close();
      consoleErrorSpy.mockRestore();
    }
  });
});

describe('CliApp assistant message handling', () => {
  test('renders non-string assistant messages immediately', async () => {
    const runtime = createRuntimeHarness();
    const { lastFrame, unmount } = render(React.createElement(CliApp, { runtime }));

    try {
      runtime.emit({
        type: 'assistant-message',
        message: ['Structured response preserved.'],
      });
      await flush();

      expect(lastFrame()).toContain('Structured response preserved.');
    } finally {
      unmount();
      runtime.close();
    }
  });

  test('fails fast when the runtime delivers a non-string assistant id', async () => {
    const runtime = createRuntimeHarness();
    const onRuntimeError = jest.fn();
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = render(React.createElement(CliApp, { runtime, onRuntimeError }));

    try {
      runtime.emit({
        type: 'assistant-message',
        __id: 42,
        message: 'should not render',
      });
      await flush();

      expect(onRuntimeError).toHaveBeenCalledTimes(1);
      const [error] = onRuntimeError.mock.calls[0];
      expect(error).toBeInstanceOf(TypeError);
      expect(String(error)).toContain('Assistant runtime event expected string "__id"');
    } finally {
      unmount();
      runtime.close();
      consoleErrorSpy.mockRestore();
    }
  });
});

describe('CliApp debug event handling', () => {
  test('surfaces auto-response debug summaries in the timeline', async () => {
    const runtime = createRuntimeHarness();
    const { lastFrame, unmount } = render(React.createElement(CliApp, { runtime }));

    try {
      runtime.emit({
        type: 'debug',
        payload: {
          stage: 'assistant-response-schema-validation-error',
          message: 'Assistant response failed schema validation.',
        },
      });

      await flush();

      expect(lastFrame()).toContain(
        'Auto-response triggered: Assistant response failed schema validation.',
      );

      runtime.emit({
        type: 'debug',
        payload: {
          stage: 'assistant-response-validation-error',
          message: 'Assistant response failed protocol validation.',
        },
      });

      await flush();

      const frame = lastFrame();
      expect(frame).toContain(
        'Auto-response triggered: Assistant response failed protocol validation.',
      );
    } finally {
      unmount();
      runtime.close();
    }
  });
});
