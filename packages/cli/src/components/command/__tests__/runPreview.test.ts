/* eslint-env jest */
import { describe, expect, test } from '@jest/globals';

import { buildRunPreview, truncateRunContent } from '../runPreview.js';

const ESC = String.fromCharCode(27);
const ANSI_PATTERN = new RegExp(`${ESC}\\[[0-9;]*m`, 'g');

const stripAnsi = (value: string): string => value.replace(ANSI_PATTERN, '');

describe('runPreview helpers', () => {
  test('truncateRunContent trims from the start by default', () => {
    expect(truncateRunContent('abcdefghijklmnop', 8, 'start')).toBe('abcdefg…');
  });

  test('truncateRunContent trims from the end when requested', () => {
    expect(truncateRunContent('abcdefghijklmnop', 8, 'end')).toBe('…jklmnop');
  });

  test('buildRunPreview can surface trailing characters for inline previews', () => {
    const preview = buildRunPreview({
      runValue: 'abcdefghijklmnop',
      limit: 8,
      allowInline: true,
      truncateDirection: 'end',
    });

    expect(preview.inline).not.toBeNull();
    const inline = stripAnsi(preview.inline ?? '').trim();
    expect(inline.startsWith('…')).toBe(true);
    expect(inline.endsWith('jklmnop')).toBe(true);
  });
});
