/* eslint-env jest */
import { jest } from '@jest/globals';
import { resolveAssistantResponse } from '../responseResolution.js';
import { createNormalizedOptions } from './testUtils.js';

const createParseSuccess = (parsed: unknown) =>
  jest.fn(() => ({ ok: true, value: parsed, recovery: { strategy: 'direct' } }));

describe('resolveAssistantResponse', () => {
  test('returns cancellation when pre-pass is canceled', () => {
    const options = createNormalizedOptions();
    const result = resolveAssistantResponse({
      prePassResult: { status: 'canceled' },
      options,
      debugEmitter: { emit: jest.fn() },
    });

    expect(result).toEqual({ status: 'canceled' });
  });

  test('bubbles schema failure when validation fails', () => {
    const options = createNormalizedOptions({
      parseAssistantResponseFn: createParseSuccess({ message: 'hi', plan: [] }),
      validateAssistantResponseSchemaFn: jest.fn(() => ({ valid: false, errors: [{ path: '$', message: 'nope' }] })),
    });

    const result = resolveAssistantResponse({
      prePassResult: { status: 'completed', responseContent: '{}' },
      options,
      debugEmitter: { emit: jest.fn() },
    });

    expect(result).toEqual({ status: 'schema-failed', reason: 'validation' });
  });

  test('maps missing content to schema failure', () => {
    const options = createNormalizedOptions();

    const result = resolveAssistantResponse({
      prePassResult: { status: 'missing-content' },
      options,
      debugEmitter: { emit: jest.fn() },
    });

    expect(result).toEqual({ status: 'schema-failed', reason: 'missing-content' });
  });

  test('returns success when parsing and validation succeed', () => {
    const parsed = { message: 'hello', plan: [] };
    const options = createNormalizedOptions({
      parseAssistantResponseFn: createParseSuccess(parsed),
      validateAssistantResponseSchemaFn: jest.fn(() => ({ valid: true, errors: [] })),
      validateAssistantResponseFn: jest.fn(() => ({ valid: true, errors: [] })),
    });

    const result = resolveAssistantResponse({
      prePassResult: { status: 'completed', responseContent: '{}' },
      options,
      debugEmitter: { emit: jest.fn() },
    });

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.parsed).toEqual(parsed);
    }
  });
});
