import { describe, expect, jest, test } from '@jest/globals';

// Capture createResponse invocations
let capturedParams: any | null = null;

jest.unstable_mockModule('../../openai/responses.js', () => {
  return {
    createResponse: jest.fn(async (params: any) => {
      capturedParams = params;
      // Minimal shape of a responses result (text or structured both OK for the wrapper)
      return {
        output_text: JSON.stringify({ message: 'ok', plan: [] }),
        output: [],
        text: undefined,
      } as any;
    }),
    getConfiguredReasoningEffort: () => null,
  };
});

import { createChatMessageEntry } from '../historyEntry.js';

describe('openaiRequest.requestModelCompletion', () => {
  test('invokes createResponse with OPENAGENT_RESPONSE_TOOL and returns success', async () => {
    const { requestModelCompletion } = await import('../openaiRequest.ts');

    const history = [
      createChatMessageEntry({ role: 'user', content: 'Hello' }),
    ];

    const observationBuilder = {
      buildCancellationObservation: () => ({}),
    } as any;

    const result = await requestModelCompletion({
      openai: {} as any,
      model: 'test-model',
      history,
      observationBuilder,
      escState: null,
      startThinkingFn: () => {},
      stopThinkingFn: () => {},
      passIndex: 0,
    });

    expect(result.status).toBe('success');
    expect(capturedParams).toBeTruthy();
    expect(Array.isArray(capturedParams.tools)).toBe(true);
    expect(capturedParams.tools[0]).toBeTruthy();
    expect(capturedParams.tools[0].name).toBe('open-agent');

    const toolSchema =
      typeof capturedParams.tools[0].schema === 'function'
        ? capturedParams.tools[0].schema()
        : capturedParams.tools[0].schema;

    expect(toolSchema).toBeTruthy();
    expect('jsonSchema' in toolSchema).toBe(true);
  });
});

