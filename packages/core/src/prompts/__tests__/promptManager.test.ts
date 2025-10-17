// @ts-nocheck
import { describe, expect, test } from '@jest/globals';
import { PromptManager } from '../manager.js';

describe('PromptManager', () => {
  test('requestUserInput delegates to promptIO', async () => {
    const requests = [];
    const promptManager = new PromptManager({
      promptIO: {
        request: async (payload) => {
          requests.push(payload);
          return 'ok';
        },
      },
      fsReader: {},
    });

    const result = await promptManager.requestUserInput('user-input', { foo: 'bar' });

    expect(result).toBe('ok');
    expect(requests).toEqual([{ scope: 'user-input', metadata: { foo: 'bar' } }]);
  });

  test('requestUserInput throws when promptIO missing', async () => {
    const promptManager = new PromptManager({ fsReader: {} });
    await expect(() => promptManager.requestUserInput('user-input')).rejects.toThrow(
      /requires a promptIO\.request/i,
    );
  });
});
