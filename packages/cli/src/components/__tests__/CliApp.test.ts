/* eslint-env jest */
import React from 'react';
import { describe, expect, jest, test } from '@jest/globals';
import { render } from 'ink-testing-library';

const cancelMock = jest.fn();
let latestAskHumanProps = null;

jest.unstable_mockModule('@asynkron/openagent-core', () => ({
  cancel: cancelMock,
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
      if (waiters.length > 0) {
        const resolve = waiters.shift();
        resolve({ value: event, done: false });
        return;
      }
      queue.push(event);
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
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

describe('CliApp slash command handling', () => {
  test('keeps the input request active after handling a local slash command', async () => {
    latestAskHumanProps = null;
    const runtime = createRuntimeHarness();
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = render(React.createElement(CliApp, { runtime }));

    try {
      runtime.emit({ type: 'request-input', prompt: '▷' });
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
