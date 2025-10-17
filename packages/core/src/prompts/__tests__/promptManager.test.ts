import { describe, expect, test } from '@jest/globals';
import { PromptManager } from '../manager.js';
import type { PromptIORequest } from '../manager.js';
import type { PromptRequestScope } from '../types.js';

describe('PromptManager', () => {
  test('requestUserInput delegates to promptIO', async () => {
    const requests: PromptIORequest[] = [];
    const promptManager = new PromptManager({
      promptIO: {
        request: async (payload: PromptIORequest) => {
          requests.push(payload);
          return 'ok';
        },
      },
      fsReader: {},
    });

    const scope: PromptRequestScope = 'user-input';
    const result = await promptManager.requestUserInput(scope, {
      promptId: 'prompt-1',
      description: 'collect user input',
      tags: ['test'],
      extra: [{ key: 'foo', value: 'bar' }],
    });

    expect(result).toBe('ok');
    expect(requests).toEqual([
      {
        scope: 'user-input',
        metadata: {
          promptId: 'prompt-1',
          description: 'collect user input',
          tags: ['test'],
          extra: [{ key: 'foo', value: 'bar' }],
        },
      },
    ]);
  });

  test('requestUserInput throws when promptIO missing', async () => {
    const promptManager = new PromptManager({ fsReader: {} });
    await expect(() => promptManager.requestUserInput('user-input')).rejects.toThrow(
      /requires a promptIO\.request/i,
    );
  });
});
