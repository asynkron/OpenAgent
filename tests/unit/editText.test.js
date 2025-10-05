const { applyEdit, applyEdits } = require('../../src/commands/edit');

describe('applyEdit', () => {
  test('inserts text at position when start === end', () => {
    const original = 'Hello world';
    const edited = applyEdit(original, { start: 5, end: 5, newText: ', dear' });
    expect(edited).toBe('Hello, dear world');
  });

  test('replaces a range of text', () => {
    const original = 'The quick brown fox';
    const edited = applyEdit(original, { start: 4, end: 9, newText: 'slow' });
    expect(edited).toBe('The slow brown fox');
  });

  test('deletes a range when newText is empty', () => {
    const original = 'abcdef';
    const edited = applyEdit(original, { start: 2, end: 5, newText: '' });
    expect(edited).toBe('abf');
  });

  test('throws on invalid ranges', () => {
    const original = 'short';
    expect(() => applyEdit(original, { start: -1, end: 2, newText: 'x' })).toThrow();
    expect(() => applyEdit(original, { start: 2, end: 10, newText: 'x' })).toThrow();
    expect(() => applyEdit(original, { start: 3, end: 2, newText: 'x' })).toThrow();
  });
});

describe('applyEdits', () => {
  test('applies multiple non-overlapping edits', () => {
    const original = 'The quick brown fox';
    const edits = [
      { start: 4, end: 9, newText: 'slow' },
      { start: 16, end: 19, newText: 'dog' },
    ];
    const edited = applyEdits(original, edits);
    expect(edited).toBe('The slow brown dog');
  });

  test('applies multiple edits safely when ranges are given in any order', () => {
    const original = 'ABCDEFG';
    const edits = [
      { start: 1, end: 3, newText: 'xx' },
      { start: 4, end: 6, newText: 'YY' },
    ];
    const edited = applyEdits(original, edits);
    expect(edited).toBe('AxxDYYG');
  });

  test('applies overlapping edits by applying sorted descending (last-first semantics)', () => {
    const original = '0123456789';
    const edits = [
      { start: 2, end: 5, newText: 'X' },
      { start: 3, end: 7, newText: 'Y' },
    ];
    const edited = applyEdits(original, edits);
    expect(edited).toBe('01X89');
  });

  test('throws when edits is not an array', () => {
    expect(() => applyEdits('abc', null)).toThrow();
  });
});
