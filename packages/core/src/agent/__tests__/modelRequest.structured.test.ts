import { describe, expect, jest, test } from '@jest/globals';

// Capture createResponse invocations
let capturedParams: Record<string, unknown> | null = null;

jest.unstable_mockModule('../../openai/responses.js', () => {
  return {
    createResponse: jest.fn(async (params: Record<string, unknown>) => {
      capturedParams = params;
      // Minimal shape of a responses result (text or structured both OK for the wrapper)
      return {
        output_text: JSON.stringify({ message: 'ok', plan: [] }),
        output: [],
        text: undefined,
      } as Record<string, unknown>;
    }),
    getConfiguredReasoningEffort: () => null,
  };
});

import { createChatMessageEntry } from '../historyEntry.js';

describe('modelRequest.requestModelCompletion', () => {
  test('invokes createResponse with OPENAGENT_RESPONSE_TOOL and returns success', async () => {
    const { requestModelCompletion } = await import('../modelRequest.ts');

    const history = [createChatMessageEntry({ role: 'user', content: 'Hello' })];

    const observationBuilder = {
      buildCancellationObservation: () => ({}),
    } as Record<string, unknown>;

    const result = await requestModelCompletion({
      openai: {} as Record<string, unknown>,
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
    expect(capturedParams.input).toEqual([{ role: 'user', content: 'Hello' }]);

    const toolSchema =
      typeof capturedParams.tools[0].schema === 'function'
        ? capturedParams.tools[0].schema()
        : capturedParams.tools[0].schema;

    expect(toolSchema).toBeTruthy();
    expect('jsonSchema' in toolSchema).toBe(true);
  });
});
