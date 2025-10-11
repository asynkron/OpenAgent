/* eslint-env jest */
import React from 'react';
import { describe, expect, jest, test } from '@jest/globals';
import { render } from 'ink-testing-library';
import AskHuman, { HUMAN_SLASH_COMMANDS } from '../AskHuman.js';

const ESC = String.fromCharCode(27);
const ANSI_ESCAPE_PATTERN = new RegExp(`${ESC}\\[[0-9;]*m`, 'g');

function stripAnsi(value) {
  return value.replace(ANSI_ESCAPE_PATTERN, '');
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

    const historyItem = HUMAN_SLASH_COMMANDS.find((item) => item.id === 'history');
    expect(historyItem).toBeDefined();
    expect(historyItem?.insertValue).toBe('/history ');

    const commandItem = HUMAN_SLASH_COMMANDS.find((item) => item.id === 'command-inspector');
    expect(commandItem).toBeDefined();
    expect(commandItem?.insertValue).toBe('/command ');
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
    expect(frame).toContain('history');
    expect(frame).toContain('command');

    unmount();
  });
});
