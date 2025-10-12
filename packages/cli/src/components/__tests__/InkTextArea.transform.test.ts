/* eslint-env jest */
import { describe, expect, test } from '@jest/globals';

import { transformToRows } from '../InkTextArea.js';

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
