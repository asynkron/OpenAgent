import React from 'react';
import { describe, expect, jest, test } from '@jest/globals';
import { render } from 'ink-testing-library';
import InkTextArea, { transformToRows } from '../../packages/cli/src/components/InkTextArea.js';

const ESC = String.fromCharCode(27);
const ANSI_ESCAPE_PATTERN = new RegExp(`${ESC}\\[[0-9;]*m`, 'g');

function stripAnsi(value) {
  return value.replace(ANSI_ESCAPE_PATTERN, '');
}

function ControlledInkTextArea(props) {
  const { initialValue = '', onChange, ...rest } = props;
  const [value, setValue] = React.useState(initialValue);

  return React.createElement(InkTextArea, {
    ...rest,
    value,
    onChange(nextValue) {
      setValue(nextValue);
      onChange?.(nextValue);
    },
  });
}

describe('InkTextArea input handling', () => {
  async function flush() {
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
  }

  function caretPositionFromFrame(frame) {
    const lines = frame.split('\n');
    const caretLine = lines.find((line) => line.includes('Caret:'));
    if (!caretLine) {
      throw new Error(`Caret debug line not found in frame:\n${frame}`);
    }
    const match = caretLine.match(/line (\d+), column (\d+), index (\d+)/);
    if (!match) {
      throw new Error(`Caret position not found in line: ${caretLine}`);
    }
    return {
      line: Number.parseInt(match[1], 10),
      column: Number.parseInt(match[2], 10),
      index: Number.parseInt(match[3], 10),
    };
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

    // Jump directly to the second row.
    stdin.write('\u001B[B');
    await flush();
    expect(caretPositionFromFrame(lastFrame()).index).toBe(2);

    // Moving up from row 1 should go back by width (2 cells).
    stdin.write('\u001B[A');
    await flush();
    expect(caretPositionFromFrame(lastFrame()).index).toBe(0);

    // Move to the start of the second row via horizontal movement.
    stdin.write('\u001B[C');
    stdin.write('\u001B[C');
    await flush();
    expect(caretPositionFromFrame(lastFrame()).index).toBe(2);

    // Once on the final row, further downward movement should be ignored.
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

    // Move caret to the third column of the first row.
    stdin.write('\u001B[C');
    stdin.write('\u001B[C');
    stdin.write('\u001B[C');
    await flush();
    expect(caretPositionFromFrame(lastFrame())).toEqual({ line: 1, column: 4, index: 3 });

    // Moving down should land in the second row with the same column.
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

    // Move to the end of the first row.
    for (let index = 0; index < 'lengthy'.length; index += 1) {
      stdin.write('\u001B[C');
    }
    await flush();
    expect(caretPositionFromFrame(lastFrame())).toEqual({ line: 1, column: 8, index: 7 });

    // Drop to the shorter second row; caret should clamp to row length.
    stdin.write('\u001B[B');
    await flush();
    expect(caretPositionFromFrame(lastFrame())).toEqual({ line: 2, column: 6, index: 13 });

    // Move back up; caret should return to the stored preferred column.
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

    // Sanity-check the default layout uses a single row.
    const initialLines = lastFrame().split('\n');
    expect(stripAnsi(initialLines[0])).toBe('abcdef');

    // Simulate the terminal shrinking by overriding columns and emitting resize.
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

  test('offers slash menu suggestions and selects highlighted item', async () => {
    const slashItems = [
      { id: 'model', label: 'model', description: 'Switch the active model' },
      { id: 'mode', label: 'mode', description: 'Change interaction mode' },
      { id: 'help', label: 'help' },
    ];
    const handleSelect = jest.fn();
    const handleSubmit = jest.fn();

    const { stdin, lastFrame, unmount } = render(
      React.createElement(ControlledInkTextArea, {
        initialValue: '',
        slashMenuItems: slashItems,
        onSlashCommandSelect: handleSelect,
        onSubmit: handleSubmit,
      }),
    );

    stdin.write('/');
    await flush();
    expect(stripAnsi(lastFrame())).toContain('model');
    expect(stripAnsi(lastFrame())).toContain('mode');
    expect(stripAnsi(lastFrame())).toContain('help');

    stdin.write('m');
    await flush();
    expect(stripAnsi(lastFrame())).toContain('model');
    expect(stripAnsi(lastFrame())).toContain('mode');
    expect(stripAnsi(lastFrame())).not.toContain('help');

    stdin.write('o');
    await flush();
    expect(lastFrame()).toContain('\u001B[7mmodel');

    stdin.write('\u001B[B');
    await flush();
    expect(lastFrame()).toContain('\u001B[7mmode');

    stdin.write('\r');
    await flush();

    expect(handleSubmit).not.toHaveBeenCalled();
    expect(handleSelect).toHaveBeenCalledTimes(1);
    expect(handleSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        item: slashItems[1],
        query: 'mo',
        range: { startIndex: 0, endIndex: 3 },
        replacement: '',
        value: '',
      }),
    );
    expect(lastFrame()).not.toContain('┌');

    unmount();
  });

  test('keeps command menu open when query includes spaces', async () => {
    const slashItems = [
      { id: 'model-gpt', label: 'model gpt-4', description: 'GPT family' },
      { id: 'model-claude', label: 'model claude', description: 'Claude family' },
    ];

    const { stdin, lastFrame, unmount } = render(
      React.createElement(ControlledInkTextArea, {
        initialValue: '',
        slashMenuItems: slashItems,
        onSubmit: jest.fn(),
      }),
    );

    stdin.write('/');
    await flush();
    expect(stripAnsi(lastFrame())).toContain('model gpt-4');

    stdin.write('model ');
    await flush();
    expect(stripAnsi(lastFrame())).toContain('model gpt-4');

    stdin.write('g');
    await flush();
    expect(stripAnsi(lastFrame())).toContain('model gpt-4');
    expect(stripAnsi(lastFrame())).not.toContain('model claude');

    unmount();
  });

  test('excludes commands that only match via example text in descriptions', async () => {
    const slashItems = [
      {
        id: 'model',
        label: 'model',
        description: 'Switch the active language model (e.g. /model gpt-4o)',
      },
      {
        id: 'model-gpt-4o',
        label: 'model gpt-4o',
        description: 'Switch to the flagship GPT-4o model',
      },
      {
        id: 'model-gpt-4o-mini',
        label: 'model gpt-4o-mini',
        description: 'Use the faster GPT-4o mini variant',
      },
    ];

    const { stdin, lastFrame, unmount } = render(
      React.createElement(ControlledInkTextArea, {
        initialValue: '',
        slashMenuItems: slashItems,
        onSubmit: jest.fn(),
      }),
    );

    stdin.write('/');
    await flush();
    expect(stripAnsi(lastFrame())).toContain('Switch the active language model');

    stdin.write('model gpt');
    await flush();

    let frame = stripAnsi(lastFrame());
    expect(frame).not.toContain('Switch the active language model');
    expect(frame).toContain('Switch to the flagship GPT-4o model');
    expect(frame).toContain('Use the faster GPT-4o mini variant');

    stdin.write('-4o');
    await flush();
    frame = stripAnsi(lastFrame());

    // Only the GPT-4o variants should remain visible for this specific query.
    expect(frame).not.toContain('Switch the active language model');
    expect(frame).toContain('Switch to the flagship GPT-4o model');
    expect(frame).toContain('Use the faster GPT-4o mini variant');

    unmount();
  });

  test('supports multiple command triggers with async providers and location rules', async () => {
    const files = [
      { id: 'alpha', label: 'alpha.txt' },
      { id: 'beta', label: 'beta.txt' },
      { id: 'config', label: 'config.json' },
    ];

    const dynamicItems = jest.fn((query) => {
      const normalized = (query ?? '').toLowerCase();
      const matches = normalized
        ? files.filter((item) => item.label.toLowerCase().includes(normalized))
        : files;
      return Promise.resolve(matches);
    });

    const commandMenus = [
      {
        id: 'root-only',
        trigger: '/',
        items: [{ id: 'root-action', label: 'root action' }],
        shouldActivate: ({ triggerIndex }) => triggerIndex === 0,
      },
      {
        id: 'mention',
        trigger: '@',
        allowInline: true,
        getItems: ({ query }) => dynamicItems(query),
      },
    ];

    const { stdin, lastFrame, unmount } = render(
      React.createElement(ControlledInkTextArea, {
        initialValue: '',
        commandMenus,
        onSubmit: jest.fn(),
      }),
    );

    stdin.write('@');
    await flush();
    await flush();
    expect(dynamicItems).toHaveBeenCalledWith('');
    expect(stripAnsi(lastFrame())).toContain('alpha.txt');
    expect(stripAnsi(lastFrame())).toContain('beta.txt');
    expect(stripAnsi(lastFrame())).toContain('config.json');

    stdin.write('co');
    await flush();
    await flush();
    expect(dynamicItems).toHaveBeenLastCalledWith('co');
    expect(stripAnsi(lastFrame())).toContain('config.json');
    expect(stripAnsi(lastFrame())).not.toContain('alpha.txt');

    unmount();

    const {
      stdin: slashStdin,
      lastFrame: slashLastFrame,
      unmount: unmountWithPrefix,
    } = render(
      React.createElement(ControlledInkTextArea, {
        initialValue: '',
        commandMenus,
        onSubmit: jest.fn(),
      }),
    );

    slashStdin.write('prefix ');
    await flush();

    // Slash command should not activate once the caret is past index 0.
    slashStdin.write('/');
    await flush();
    expect(stripAnsi(slashLastFrame())).not.toContain('root action');

    unmountWithPrefix();

    const {
      stdin: rootOnlyStdin,
      lastFrame: rootOnlyFrame,
      unmount: unmountRootOnly,
    } = render(
      React.createElement(ControlledInkTextArea, {
        initialValue: '',
        commandMenus,
        onSubmit: jest.fn(),
      }),
    );

    // Slash command should activate when typed at the start of the input.
    rootOnlyStdin.write('/');
    await flush();
    expect(stripAnsi(rootOnlyFrame())).toContain('root action');

    unmountRootOnly();
  });
});

describe('transformToRows', () => {
  test('splits lines on newline characters', () => {
    const rows = transformToRows('hello\nworld', 10);
    expect(rows).toEqual([
      { text: 'hello', startIndex: 0 },
      { text: 'world', startIndex: 6 },
    ]);
  });

  test('wraps content when width is exceeded', () => {
    const rows = transformToRows('abcdef', 3);
    expect(rows).toEqual([
      { text: 'abc', startIndex: 0 },
      { text: 'def', startIndex: 3 },
    ]);
  });

  test('respects horizontal padding when wrapping', () => {
    const rows = transformToRows('abcdefgh', 8, { paddingLeft: 1, paddingRight: 1 });
    expect(rows).toEqual([
      { text: 'abcdef', startIndex: 0 },
      { text: 'gh', startIndex: 6 },
    ]);
  });

  test('preserves blank lines introduced by trailing newline', () => {
    const rows = transformToRows('row-one\n', 40);
    expect(rows).toEqual([
      { text: 'row-one', startIndex: 0 },
      { text: '', startIndex: 8 },
    ]);
  });

  test('treats carriage returns as newline boundaries', () => {
    const rows = transformToRows('alpha\rcarriage', 40);
    expect(rows).toEqual([
      { text: 'alpha', startIndex: 0 },
      { text: 'carriage', startIndex: 6 },
    ]);
  });

  test('treats CRLF pairs as a single newline break', () => {
    const rows = transformToRows('first\r\nsecond', 40);
    expect(rows).toEqual([
      { text: 'first', startIndex: 0 },
      { text: 'second', startIndex: 7 },
    ]);
  });
});
