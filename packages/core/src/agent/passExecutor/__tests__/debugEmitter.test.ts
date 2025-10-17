/* eslint-env jest */
import { describe, expect, test, jest } from '@jest/globals';
import { createDebugEmitter } from '../debugEmitter.js';
import type { DebugPayload } from '../types.js';
import type { AssistantPayload } from '../responseParser.js';

const createPayload = <T extends DebugPayload>(payload: T): T => payload;

describe('createDebugEmitter', () => {
  test('returns noop emitter when listener missing', () => {
    const emitter = createDebugEmitter(null);
    expect(() =>
      emitter.emit(createPayload({ stage: 'assistant-response', parsed: {} as unknown as AssistantPayload })),
    ).not.toThrow();
  });

  test('emits prepared payloads and factories', () => {
    const listener = jest.fn();
    const emitter = createDebugEmitter(listener);
    const payload = createPayload({
      stage: 'assistant-response',
      parsed: { message: 'ok', plan: [] } as unknown as AssistantPayload,
    });

    emitter.emit(payload);
    emitter.emit(() => ({
      stage: 'assistant-response',
      parsed: { message: 'ok', plan: [] } as unknown as AssistantPayload,
    }));

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenCalledWith(payload);
  });

  test('emits debug-payload-error when factory throws', () => {
    const listener = jest.fn();
    const emitter = createDebugEmitter(listener);

    const error = new Error('boom');
    emitter.emit(() => {
      throw error;
    });

    expect(listener).toHaveBeenCalledWith({
      stage: 'debug-payload-error',
      message: 'boom',
    });
  });
});
