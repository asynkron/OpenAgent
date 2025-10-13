import { describe, expect, jest, test } from '@jest/globals';

let generateObjectMock: jest.Mock;

// Mock the AI SDK entrypoints for this suite
jest.unstable_mockModule('ai', () => {
  generateObjectMock = jest.fn(async (options: any) => {
    // Provide a structured object-shaped result similar to the SDK
    return {
      object: { message: 'ok', plan: [] },
      response: { id: 'test-id' },
    } as any;
  });

  return {
    generateObject: generateObjectMock,
    generateText: jest.fn(),
  };
});

import { OPENAGENT_RESPONSE_TOOL } from '../../agent/responseToolSchema.js';

describe('createResponse uses generateObject with tool schema', () => {
  test('passes provider-agnostic schema wrapper to AI SDK', async () => {
    const { createResponse } = await import('../responses.ts');

    const openaiProvider = (model: string) => ({ model });

    const result = await createResponse({
      openai: openaiProvider as any,
      model: 'test-model',
      input: [],
      tools: [OPENAGENT_RESPONSE_TOOL as any],
    });

    expect(result).toBeTruthy();
    expect(generateObjectMock).toHaveBeenCalledTimes(1);

    const call = generateObjectMock.mock.calls[0][0];
    expect(call).toBeTruthy();

    // The schema provided to generateObject should be the flexible wrapper
    const providedSchema = call.schema;
    expect(providedSchema).toBeTruthy();
    expect(typeof providedSchema).toBe('object');
    expect('jsonSchema' in providedSchema).toBe(true);

    const jsonSchema = (providedSchema as any).jsonSchema;
    expect(jsonSchema).toBeTruthy();
    expect(jsonSchema).toHaveProperty('properties');
    expect(jsonSchema.properties).toHaveProperty('plan');
  });
});

