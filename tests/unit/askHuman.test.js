import React from 'react';
import { describe, expect, jest, test } from '@jest/globals';
import { render } from 'ink-testing-library';
import AskHuman, { HUMAN_SLASH_COMMANDS } from '../../src/cli/components/AskHuman.js';

function stripAnsi(value) {
  return value.replace(/\u001B\[[0-9;]*m/g, '');
}

async function flush() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

describe('AskHuman slash commands', () => {
  test('exposes a default model switching shortcut', () => {
    const modelItem = HUMAN_SLASH_COMMANDS.find((item) => item.id === 'model');
    expect(modelItem).toBeDefined();
    expect(modelItem?.insertValue).toBe('/model ');
  });

  test('renders slash menu suggestions when triggered', async () => {
    const handleSubmit = jest.fn();

    const { stdin, lastFrame, unmount } = render(
      React.createElement(AskHuman, { onSubmit: handleSubmit }),
    );

    stdin.write('/');
    await flush();

    const frame = stripAnsi(lastFrame());
    expect(frame).toContain('model');
    expect(frame).toContain('reasoning high');
    expect(frame).toContain('help');

    unmount();
  });
});
