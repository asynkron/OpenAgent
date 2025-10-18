import { describe, expect, jest, test } from '@jest/globals';
import type { PlanResponse } from '../../contracts/index.js';
import type { ResponsesClient } from '../responses.js';

let streamObjectMock: jest.Mock;

// Mock the AI SDK entrypoints for this suite
jest.unstable_mockModule('ai', () => {
  streamObjectMock = jest.fn(() => ({
    partialObjectStream: (async function* partialStream() {})(),
    object: Promise.resolve({ message: 'ok', plan: [] }),
    finishReason: Promise.resolve('stop'),
    usage: Promise.resolve({ inputTokens: 1, outputTokens: 2, totalTokens: 3 }),
    warnings: Promise.resolve(undefined),
    request: Promise.resolve({}),
    response: Promise.resolve({ id: 'test-id' }),
    providerMetadata: Promise.resolve(undefined),
  }));

  return {
    streamObject: streamObjectMock,
    generateText: jest.fn(),
  };
});

import { ToolDefinition } from '../../contracts/index.js';

describe('createResponse uses generateObject with tool schema', () => {
  test('passes provider-agnostic schema wrapper to AI SDK', async () => {
    const { createResponse } = await import('../responses.ts');

    const openaiProvider: ResponsesClient = ((model: string) => ({ model })) as ResponsesClient;

    const result = await createResponse({
      openai: openaiProvider as Record<string, unknown>,
      model: 'test-model',
      input: [],
      tools: [ToolDefinition as Record<string, unknown>],
    });

    expect(result).toBeTruthy();
    expect(streamObjectMock).toHaveBeenCalledTimes(1);

    const call = streamObjectMock.mock.calls[0][0];
    expect(call).toBeTruthy();

    // The schema provided to generateObject should be the flexible wrapper
    const providedSchema = call.schema;
    expect(providedSchema).toBeTruthy();
    expect(typeof providedSchema).toBe('object');
    expect('jsonSchema' in providedSchema).toBe(true);

    const jsonSchema = (providedSchema as Record<string, unknown>).jsonSchema;
    expect(jsonSchema).toBeTruthy();
    expect(jsonSchema).toHaveProperty('properties');
    expect(jsonSchema.properties).toHaveProperty('plan');
  });

  test('emits structured stream callbacks when provided', async () => {
    const { createResponse } = await import('../responses.ts');
    const partials: Array<Partial<PlanResponse>> = [
      { message: 'First partial message' },
      { plan: [] },
    ];

    streamObjectMock.mockImplementation(() => ({
      partialObjectStream: (async function* partialStream() {
        for (const value of partials) {
          yield value;
        }
      })(),
      object: Promise.resolve({ message: 'done' }),
      finishReason: Promise.resolve('stop'),
      usage: Promise.resolve({ inputTokens: 1, outputTokens: 1, totalTokens: 2 }),
      warnings: Promise.resolve(undefined),
      request: Promise.resolve({}),
      response: Promise.resolve({ id: 'test-id' }),
      providerMetadata: Promise.resolve(undefined),
    }));

    const onPartial = jest.fn();
    const onFinish = jest.fn();

    const languageModel = {};
    const openaiProvider: ResponsesClient = {
      responses: jest.fn().mockReturnValue(languageModel),
    };

    await createResponse({
      openai: openaiProvider,
      model: 'test-model',
      input: [],
      tools: [ToolDefinition as Record<string, unknown>],
      onStructuredStreamPartial: onPartial,
      onStructuredStreamFinish: onFinish,
    });

    expect(onPartial).toHaveBeenCalledTimes(partials.length);
    expect(onPartial).toHaveBeenNthCalledWith(1, partials[0]);
    expect(onPartial).toHaveBeenNthCalledWith(2, partials[1]);
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(openaiProvider.responses).toHaveBeenCalledWith('test-model');
  });
});
