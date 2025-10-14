/* eslint-env jest */
import React from 'react';
import { describe, expect, test } from '@jest/globals';
import { render } from 'ink-testing-library';
import PlanDetail from '../PlanDetail.tsx';

const ESC = String.fromCharCode(27);
const ANSI_ESCAPE_PATTERN = new RegExp(`${ESC}\\[[0-9;]*m`, 'g');

function stripAnsi(value) {
  return value.replace(ANSI_ESCAPE_PATTERN, '');
}

describe('PlanDetail', () => {
  test('renders status metadata and command preview when present', () => {
    const node = {
      id: '1',
      label: '1',
      depth: 0,
      symbol: '▶',
      color: 'yellow',
      title: 'Compile project',
      status: 'running',
      commandPreview: 'run: npm run build -- --watch',
    };

    const { lastFrame, unmount } = render(React.createElement(PlanDetail, { node }));

    try {
      const frame = stripAnsi(lastFrame());
      const lines = frame.split('\n').map((line) => line.trimEnd());
      expect(lines[0]).toBe('▶ 1. Compile project -  running');
      expect(lines[1].trim()).toBe('↳ run: npm run build -- --watch');
    } finally {
      unmount();
    }
  });

  test('omits metadata when status and dependencies are missing', () => {
    const node = {
      id: '2',
      label: '2',
      depth: 1,
      symbol: '•',
      color: 'gray',
      title: 'Investigate logs',
    };

    const { lastFrame, unmount } = render(React.createElement(PlanDetail, { node }));

    try {
      const frame = stripAnsi(lastFrame());
      const lines = frame.split('\n').map((line) => line.trimEnd());
      expect(lines[0]).toBe('  • 2. Investigate logs');
      expect(lines).toHaveLength(1);
    } finally {
      unmount();
    }
  });
});
