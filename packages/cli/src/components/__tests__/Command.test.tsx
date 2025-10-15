/* eslint-env jest */
import React from 'react';
import { describe, expect, test } from '@jest/globals';
import { render } from 'ink-testing-library';

const { default: Command } = await import('../Command.tsx');

// Strip ANSI color sequences so assertions can focus on textual layout.
function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, '');
}

describe('Command', () => {
  test('renders single-line execute runs inline with syntax highlighting', () => {
    const { lastFrame } = render(
      React.createElement(Command, {
        command: { run: 'echo hello' },
      }),
    );

    const frame = lastFrame() ?? '';
    const plain = stripAnsi(frame);

    expect(plain).toContain('❯ echo hello');
    expect(frame).toMatch(/\u001b\[[0-9;]*36m/);
  });
});
