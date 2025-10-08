import React from 'react';
import { describe, expect, jest, test } from '@jest/globals';
import { render } from 'ink-testing-library';
import InkTextArea from '../../src/cli/components/InkTextArea.js';

describe('InkTextArea input handling', () => {
  async function flush() {
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
  }

  function caretIndexFromFrame(frame) {
    const lines = frame.split('\n');
    const caretLine = lines.find((line) => line.includes('Caret:'));
    if (!caretLine) {
      throw new Error(`Caret debug line not found in frame:\n${frame}`);
    }
    const match = caretLine.match(/index (\d+)/);
    if (!match) {
      throw new Error(`Caret index not found in line: ${caretLine}`);
    }
    return Number.parseInt(match[1], 10);
  }

  test('captures character input and notifies onChange', async () => {
    const handleChange = jest.fn();

    const { stdin, unmount } = render(
      React.createElement(InkTextArea, {
        value: '',
        onChange: handleChange,
        onSubmit: jest.fn(),
      }),
    );

    stdin.write('a');
    await flush();

    expect(handleChange).toHaveBeenCalledWith('a');

    unmount();
  });

  test('submits the current value on enter', async () => {
    const handleSubmit = jest.fn();

    const { stdin, unmount } = render(
      React.createElement(InkTextArea, {
        value: 'ready',
        onChange: jest.fn(),
        onSubmit: handleSubmit,
      }),
    );

    stdin.write('\r');
    await flush();

    expect(handleSubmit).toHaveBeenCalledWith('ready');

    unmount();
  });

  test('moves caret with left/right arrow keys', async () => {
    const { stdin, unmount, lastFrame } = render(
      React.createElement(InkTextArea, {
        value: 'hi',
        onChange: jest.fn(),
        onSubmit: jest.fn(),
      }),
    );

    expect(caretIndexFromFrame(lastFrame())).toBe(0);

    stdin.write('\u001B[C');
    await flush();
    expect(caretIndexFromFrame(lastFrame())).toBe(1);

    stdin.write('\u001B[D');
    await flush();
    expect(caretIndexFromFrame(lastFrame())).toBe(0);

    unmount();
  });
});
