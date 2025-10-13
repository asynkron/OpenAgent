/* eslint-env jest */
import { describe, expect, test } from '@jest/globals';

import { cloneValue, coerceRuntime, normalizeStatus, parsePositiveInteger } from '../runtimeUtils.js';

describe('runtimeUtils.cloneValue', () => {
  test('returns primitives untouched', () => {
    expect(cloneValue(5)).toBe(5);
    expect(cloneValue('hello')).toBe('hello');
    expect(cloneValue(null)).toBeNull();
    expect(cloneValue(undefined)).toBeUndefined();
  });

  test('clones plain objects to avoid shared references', () => {
    const original = { nested: { value: 1 } };
    const cloned = cloneValue(original);

    expect(cloned).not.toBe(original);
    expect(cloned).toEqual(original);

    // Mutations on the clone should not leak to the original.
    (cloned as { nested: { value: number } }).nested.value = 2;
    expect(original.nested.value).toBe(1);
  });

  test('falls back when structuredClone throws', () => {
    if (typeof structuredClone !== 'function') {
      return;
    }

    const previous = globalThis.structuredClone;
    (globalThis as typeof globalThis & { structuredClone: typeof structuredClone }).structuredClone = () => {
      throw new Error('boom');
    };

    try {
      const value = { a: 1 };
      const cloned = cloneValue(value);
      expect(cloned).toEqual(value);
      expect(cloned).not.toBe(value);
    } finally {
      (globalThis as typeof globalThis & { structuredClone: typeof structuredClone }).structuredClone = previous;
    }
  });
});

describe('runtimeUtils.parsePositiveInteger', () => {
  test('accepts numeric primitives', () => {
    expect(parsePositiveInteger(3)).toBe(3);
    expect(parsePositiveInteger(3.8)).toBe(3);
    expect(parsePositiveInteger(-5, 2)).toBe(2);
  });

  test('parses string inputs', () => {
    expect(parsePositiveInteger('7')).toBe(7);
    expect(parsePositiveInteger(' 12 ')).toBe(12);
    expect(parsePositiveInteger('abc', 4)).toBe(4);
  });
});

describe('runtimeUtils.normalizeStatus', () => {
  test('normalizes message, level, and details', () => {
    const result = normalizeStatus({
      message: 'All good',
      level: 'info',
      details: 42,
    });

    expect(result).toEqual({
      message: 'All good',
      level: 'info',
      details: '42',
    });
  });

  test('rejects payloads without a message', () => {
    expect(normalizeStatus({ level: 'warn' })).toBeNull();
  });

  test('returns null for invalid input', () => {
    expect(normalizeStatus(null)).toBeNull();
    expect(normalizeStatus(undefined)).toBeNull();
    expect(normalizeStatus({})).toBeNull();
  });
});

describe('runtimeUtils.coerceRuntime', () => {
  test('returns null for non-object values', () => {
    expect(coerceRuntime(null)).toBeNull();
    expect(coerceRuntime(undefined)).toBeNull();
  });

  test('preserves runtime-like objects', () => {
    const runtime = { start: async () => {} } as const;
    expect(coerceRuntime(runtime)).toBe(runtime);
  });
});
