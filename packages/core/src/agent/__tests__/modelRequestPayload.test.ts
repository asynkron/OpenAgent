import { describe, expect, test } from '@jest/globals';
import { buildOpenAgentRequestPayload } from '../modelRequestPayload.ts';
import { createChatMessageEntry } from '../historyEntry.js';

describe('buildOpenAgentRequestPayload', () => {
  test('projects chat history into a typed request payload', () => {
    const history = [
      createChatMessageEntry({ role: 'system', content: 'System prompt' }),
      createChatMessageEntry({ role: 'user', content: 'Hello there' }),
      createChatMessageEntry({ role: 'assistant', content: 'Here is an answer.' }),
    ];

    const payload = buildOpenAgentRequestPayload({ model: 'gpt-test', history });

    expect(payload.model).toBe('gpt-test');
    expect(payload.tool.name).toBe('open-agent');
    expect(payload.messages).toHaveLength(3);
    expect(payload.messages[0]).toEqual({ role: 'system', content: 'System prompt' });
    expect(payload.messages[1]).toEqual({ role: 'user', content: 'Hello there' });
    expect(payload.messages[2]).toEqual({ role: 'assistant', content: 'Here is an answer.' });
  });

  test('preserves optional call settings when supplied', () => {
    const history = [createChatMessageEntry({ role: 'user', content: 'ping' })];
    const payload = buildOpenAgentRequestPayload({
      model: 'gpt-test',
      history,
      options: { maxRetries: 2 },
    });

    expect(payload.options).toEqual({ maxRetries: 2 });
  });
});
