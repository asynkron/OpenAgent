import { describe, expect, test } from '@jest/globals';
import {
  isApprovalNotification,
  normaliseClassList,
  normalisePreview,
  normaliseText,
} from '../chat_model.js';

describe('chat_model helpers', () => {
  test('normaliseText converts arbitrary values without throwing', () => {
    expect(normaliseText('hello')).toBe('hello');
    expect(normaliseText(undefined)).toBe('');
    expect(normaliseText(42)).toBe('42');
  });

  test('normaliseClassList accepts whitespace-delimited strings and arrays', () => {
    expect(normaliseClassList('foo   bar baz')).toEqual(['foo', 'bar', 'baz']);
    expect(normaliseClassList(['alpha', ''])).toEqual(['alpha']);
    expect(normaliseClassList(null)).toEqual([]);
  });

  test('isApprovalNotification flags payloads containing approval copy', () => {
    expect(
      isApprovalNotification({
        text: 'Approve running this command?',
      }),
    ).toBe(true);

    expect(
      isApprovalNotification({
        metadata: { scope: 'general' },
      }),
    ).toBe(false);
  });

  test('normalisePreview ensures a predictable structure', () => {
    expect(normalisePreview(undefined)).toEqual({ code: '', language: '', classNames: [] });

    expect(
      normalisePreview({
        code: 'echo hello',
        language: 'bash',
        classNames: 'foo  bar',
      }),
    ).toEqual({ code: 'echo hello', language: 'bash', classNames: ['foo', 'bar'] });
  });
});
