import React from 'react';
import { describe, expect, jest, test } from '@jest/globals';
import { render } from 'ink-testing-library';
import InkTextArea from '../../src/cli/components/InkTextArea.js';

describe('InkTextArea input handling', () => {
  async function flush() {
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
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
});
