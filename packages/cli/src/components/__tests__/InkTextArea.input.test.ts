/* eslint-env jest */
import React from 'react';
import { describe, expect, jest, test } from '@jest/globals';
import { render } from 'ink-testing-library';

import InkTextArea from '../InkTextArea.js';
import {
  caretPositionFromFrame,
  ControlledInkTextArea,
  flush,
  stripAnsi,
} from '../test-utils/InkTextArea.js';

describe('InkTextArea input handling', () => {
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

  test('ignores trailing line feed emitted after a plain return press', async () => {
    const handleSubmit = jest.fn();
    const handleChange = jest.fn();

    const { stdin, unmount } = render(
      React.createElement(ControlledInkTextArea, {
        initialValue: 'ready',
        onChange: handleChange,
        onSubmit: handleSubmit,
      }),
    );

    stdin.write('\r');
    await flush();

    stdin.write('\n');
    await flush();

    expect(handleSubmit).toHaveBeenCalledTimes(1);
    expect(handleSubmit).toHaveBeenCalledWith('ready');
    expect(handleChange).not.toHaveBeenCalled();

    unmount();
  });

  test('inserts a newline without submitting when shift+enter is received', async () => {
    const handleSubmit = jest.fn();
    const handleChange = jest.fn();

    const { stdin, unmount, lastFrame } = render(
      React.createElement(ControlledInkTextArea, {
        initialValue: '',
        onSubmit: handleSubmit,
        onChange: handleChange,
      }),
    );

    stdin.write('hello');
    await flush();

    handleChange.mockClear();

    stdin.write('\n');
    await flush();

    expect(handleSubmit).not.toHaveBeenCalled();
    expect(handleChange).toHaveBeenLastCalledWith('hello\n');

    const caret = caretPositionFromFrame(lastFrame());
    expect(caret.index).toBe(6);
    expect(caret.line).toBe(2);
    expect(caret.column).toBe(1);

    unmount();
  });

  test('treats escape sequence for shift+enter as newline insertion', async () => {
    const handleSubmit = jest.fn();
    const handleChange = jest.fn();

    const { stdin, unmount, lastFrame } = render(
      React.createElement(ControlledInkTextArea, {
        initialValue: '',
        onSubmit: handleSubmit,
        onChange: handleChange,
      }),
    );

    stdin.write('draft');
    await flush();

    handleChange.mockClear();

    stdin.write('\u001B[13;2~');
    await flush();

    expect(handleSubmit).not.toHaveBeenCalled();
    expect(handleChange).toHaveBeenLastCalledWith('draft\n');

    const caret = caretPositionFromFrame(lastFrame());
    expect(caret.index).toBe(6);
    expect(caret.line).toBe(2);
    expect(caret.column).toBe(1);

    unmount();
  });

  test('moves caret with left/right arrow keys', async () => {
    const { stdin, unmount, lastFrame } = render(
      React.createElement(InkTextArea, {
        value: 'hi',
        onChange: jest.fn(),
        onSubmit: jest.fn(),
        width: 2,
      }),
    );

    expect(caretPositionFromFrame(lastFrame()).index).toBe(0);

    stdin.write('\u001B[C');
    await flush();
    expect(caretPositionFromFrame(lastFrame()).index).toBe(1);

    stdin.write('\u001B[D');
    await flush();
    expect(caretPositionFromFrame(lastFrame()).index).toBe(0);

    unmount();
  });

  test('moves caret vertically by width-sized jumps', async () => {
    const { stdin, unmount, lastFrame } = render(
      React.createElement(InkTextArea, {
        value: 'abcd',
        onChange: jest.fn(),
        onSubmit: jest.fn(),
        width: 2,
      }),
    );

    stdin.write('\u001B[B');
    await flush();
    expect(caretPositionFromFrame(lastFrame()).index).toBe(2);

    stdin.write('\u001B[A');
    await flush();
    expect(caretPositionFromFrame(lastFrame()).index).toBe(0);

    stdin.write('\u001B[C');
    stdin.write('\u001B[C');
    await flush();
    expect(caretPositionFromFrame(lastFrame()).index).toBe(2);

    stdin.write('\u001B[B');
    await flush();
    expect(caretPositionFromFrame(lastFrame()).index).toBe(2);

    unmount();
  });

  test('moves caret vertically across newline-delimited rows', async () => {
    const { stdin, unmount, lastFrame } = render(
      React.createElement(InkTextArea, {
        value: 'first\nsecond',
        onChange: jest.fn(),
        onSubmit: jest.fn(),
        width: 20,
      }),
    );

    stdin.write('\u001B[C');
    stdin.write('\u001B[C');
    stdin.write('\u001B[C');
    await flush();
    expect(caretPositionFromFrame(lastFrame())).toEqual({ line: 1, column: 4, index: 3 });

    stdin.write('\u001B[B');
    await flush();
    expect(caretPositionFromFrame(lastFrame())).toEqual({ line: 2, column: 4, index: 9 });

    unmount();
  });

  test('restores preferred column when returning to a longer row', async () => {
    const { stdin, unmount, lastFrame } = render(
      React.createElement(InkTextArea, {
        value: 'lengthy\nshort',
        onChange: jest.fn(),
        onSubmit: jest.fn(),
        width: 20,
      }),
    );

    for (let index = 0; index < 'lengthy'.length; index += 1) {
      stdin.write('\u001B[C');
    }
    await flush();
    expect(caretPositionFromFrame(lastFrame())).toEqual({ line: 1, column: 8, index: 7 });

    stdin.write('\u001B[B');
    await flush();
    expect(caretPositionFromFrame(lastFrame())).toEqual({ line: 2, column: 6, index: 13 });

    stdin.write('\u001B[A');
    await flush();
    expect(caretPositionFromFrame(lastFrame())).toEqual({ line: 1, column: 8, index: 7 });

    unmount();
  });

  test('recomputes rows when stdout reports a resize', async () => {
    const { lastFrame, stdout, unmount } = render(
      React.createElement(InkTextArea, {
        value: 'abcdef',
        onChange: jest.fn(),
        onSubmit: jest.fn(),
      }),
    );

    const initialLines = lastFrame().split('\n');
    expect(stripAnsi(initialLines[0])).toBe('abcdef');

    Object.defineProperty(stdout, 'columns', {
      configurable: true,
      get() {
        return 3;
      },
    });
    stdout.emit('resize');
    await flush();

    const resizedLines = lastFrame().split('\n');
    expect(stripAnsi(resizedLines[0])).toMatch(/^ ?abc$/);
    expect(stripAnsi(resizedLines[1])).toBe('def');

    unmount();
  });
});
