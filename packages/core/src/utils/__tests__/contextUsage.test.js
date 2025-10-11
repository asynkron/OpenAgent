/* eslint-env jest */
import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';

import {
  estimateTokensForHistory,
  getContextWindow,
  summarizeContextUsage,
} from '../contextUsage.js';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.OPENAI_CONTEXT_WINDOW = '';
});

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, ORIGINAL_ENV);
});

describe('getContextWindow', () => {
  test('respects OPENAI_CONTEXT_WINDOW override when valid', () => {
    process.env.OPENAI_CONTEXT_WINDOW = '64000';
    expect(getContextWindow({ model: 'unknown-model' })).toBe(64_000);
  });

  test('falls back to model mapping when no override present', () => {
    expect(getContextWindow({ model: 'gpt-4o-mini' })).toBe(128_000);
  });

  test('uses default window when model not recognised', () => {
    expect(getContextWindow({ model: 'mystery-model' })).toBe(256_000);
  });

  test('returns null when override is explicitly non-positive', () => {
    process.env.OPENAI_CONTEXT_WINDOW = '0';
    expect(getContextWindow({ model: 'gpt-4o-mini' })).toBeNull();
  });
});

describe('estimateTokensForHistory', () => {
  test('returns 0 for empty or invalid history', () => {
    expect(estimateTokensForHistory(null)).toBe(0);
    expect(estimateTokensForHistory([])).toBe(0);
  });

  test('estimates tokens using character length heuristic', () => {
    const history = [
      { type: 'chat-message', role: 'system', content: 'You are a helpful assistant.', pass: 0 },
      { type: 'chat-message', role: 'user', content: 'Explain recursion.', pass: 1 },
      {
        type: 'chat-message',
        role: 'assistant',
        content: 'Recursion is a process where a function calls itself.',
        pass: 1,
      },
    ];

    const estimate = estimateTokensForHistory(history);
    expect(estimate).toBeGreaterThan(0);

    const larger = estimateTokensForHistory([
      ...history,
      { type: 'chat-message', role: 'user', content: 'x'.repeat(200), pass: 2 },
    ]);
    expect(larger).toBeGreaterThan(estimate);
  });

  test('handles structured content gracefully', () => {
    const history = [
      {
        type: 'chat-message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello' }, { value: 'world' }],
        pass: 3,
      },
    ];

    const estimate = estimateTokensForHistory(history);
    expect(estimate).toBeGreaterThan(0);
  });
});

describe('summarizeContextUsage', () => {
  test('returns null totals when window unavailable', () => {
    process.env.OPENAI_CONTEXT_WINDOW = '0';
    const summary = summarizeContextUsage({ history: [], model: 'unused' });
    expect(summary).toEqual({
      total: null,
      used: 0,
      remaining: null,
      percentRemaining: null,
    });
  });

  test('computes remaining context statistics', () => {
    const history = [
      { type: 'chat-message', role: 'system', content: 'Sys', pass: 0 },
      { type: 'chat-message', role: 'user', content: 'Explain binary search in detail.', pass: 1 },
    ];

    const summary = summarizeContextUsage({ history, model: 'gpt-4o-mini' });
    expect(summary.total).toBe(128_000);
    expect(summary.used).toBeGreaterThan(0);
    expect(summary.remaining).toBeLessThan(summary.total);
    expect(summary.percentRemaining).toBeGreaterThan(0);
  });
});
