/* eslint-env jest */
import { jest } from '@jest/globals';
import { runPrePassSequence } from '../prePassSequence.js';
import {
  createNormalizedOptions,
  createObservationBuilderStub,
} from '../__testUtils__/passExecutor.js';

describe('runPrePassSequence', () => {
  test('returns completed result when model response is available', async () => {
    const history: unknown[] = [];
    const createChatMessageEntryFn = jest.fn((entry) => ({ ...entry, id: 'entry-1' }));
    const requestModelCompletionFn = jest.fn(async () => ({
      status: 'success',
      completion: { id: 'cmpl_123' },
    }));
    const extractOpenAgentToolCallFn = jest.fn(() => ({ arguments: '{"message":"hello"}' }));
    const summarizeContextUsageFn = jest.fn(() => ({ total: 10 }));
    const guardRequestPayloadSizeFn = jest.fn();

    const options = createNormalizedOptions({
      history: history as never[],
      createChatMessageEntryFn,
      requestModelCompletionFn,
      extractOpenAgentToolCallFn,
      summarizeContextUsageFn,
      guardRequestPayloadSizeFn,
    });

    const result = await runPrePassSequence({
      options,
      observationBuilder: createObservationBuilderStub(),
      debugEmitter: { emit: jest.fn() },
    });

    expect(result).toEqual({
      status: 'completed',
      responseContent: '{"message":"hello"}',
      responseEmitter: expect.any(Object),
    });
    expect(history).toHaveLength(1);
    expect(guardRequestPayloadSizeFn).toHaveBeenCalledWith({
      history,
      model: options.model,
      passIndex: options.passIndex,
    });
    expect(summarizeContextUsageFn).toHaveBeenCalled();
  });

  test('propagates cancellation from the request', async () => {
    const options = createNormalizedOptions({
      requestModelCompletionFn: jest.fn(async () => ({ status: 'canceled' })),
    });

    const result = await runPrePassSequence({
      options,
      observationBuilder: createObservationBuilderStub(),
      debugEmitter: { emit: jest.fn() },
    });

    expect(result).toEqual({ status: 'canceled' });
    expect(options.createChatMessageEntryFn).not.toHaveBeenCalled();
  });

  test('flags missing content when tool arguments are empty', async () => {
    const emitEvent = jest.fn();
    const requestModelCompletionFn = jest.fn(async () => ({
      status: 'success',
      completion: { id: 'cmpl_missing' },
    }));
    const extractOpenAgentToolCallFn = jest.fn(() => ({ arguments: '' }));

    const options = createNormalizedOptions({
      emitEvent,
      requestModelCompletionFn,
      extractOpenAgentToolCallFn,
    });

    const result = await runPrePassSequence({
      options,
      observationBuilder: createObservationBuilderStub(),
      debugEmitter: { emit: jest.fn() },
    });

    expect(result).toEqual({ status: 'missing-content' });
    expect(emitEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        message: 'OpenAI response did not include text output.',
      }),
    );
  });
});
