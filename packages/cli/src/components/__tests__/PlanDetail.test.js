/* eslint-env jest */
import React from 'react';
import { describe, expect, test } from '@jest/globals';
import { render } from 'ink-testing-library';
import PlanDetail from '../PlanDetail.js';

const ESC = String.fromCharCode(27);
const ANSI_ESCAPE_PATTERN = new RegExp(`${ESC}\\[[0-9;]*m`, 'g');

function stripAnsi(value) {
  return value.replace(ANSI_ESCAPE_PATTERN, '');
}

describe('PlanDetail', () => {
  test('renders age and command preview when present', () => {
    const node = {
      id: '1',
      label: '1',
      depth: 0,
      symbol: '▶',
      color: 'yellow',
      title: 'Compile project',
      age: 4,
      commandPreview: 'run: npm run build -- --watch',
    };

    const { lastFrame, unmount } = render(React.createElement(PlanDetail, { node }));

    try {
      const frame = stripAnsi(lastFrame());
      expect(frame).toContain('▶ 1. Compile project (age 4)');
      expect(frame).toContain('↳ run: npm run build -- --watch');
    } finally {
      unmount();
    }
  });

  test('falls back to age zero when missing', () => {
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
      expect(frame).toContain('• 2. Investigate logs (age 0)');
      expect(frame).not.toContain('↳');
    } finally {
      unmount();
    }
  });
});
