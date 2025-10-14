/* eslint-env jest */
import { createChatMessageEntry, mapHistoryToModelMessages } from '../historyEntry.js';

describe('historyEntry', () => {
  test('omits root role/content when stringified', () => {
    const entry = createChatMessageEntry({
      eventType: 'chat-message',
      role: 'system',
      content: 'Test content',
      pass: 0,
    });

    const parsed = JSON.parse(JSON.stringify(entry));

    expect(parsed).toHaveProperty('eventType', 'chat-message');
    expect(parsed).not.toHaveProperty('role');
    expect(parsed).not.toHaveProperty('content');
    expect(parsed).toHaveProperty(['payload', 'role'], 'system');
    expect(parsed).toHaveProperty(['payload', 'content'], 'Test content');
  });

  test('exposes role/content accessors that proxy payload values', () => {
    const entry = createChatMessageEntry({
      eventType: 'chat-message',
      role: 'assistant',
      content: 'Hello world',
    });

    expect(entry.role).toBe('assistant');
    expect(entry.content).toBe('Hello world');

    entry.role = 'user';
    entry.content = 'Updated';

    expect(entry.payload.role).toBe('user');
    expect(entry.payload.content).toBe('Updated');
  });

  test('mapHistoryToModelMessages resolves role/content from payload', () => {
    const entry = createChatMessageEntry({
      eventType: 'chat-message',
      role: 'user',
      content: 'Greetings',
    });

    const messages = mapHistoryToModelMessages([entry]);
    expect(messages).toEqual([{ role: 'user', content: 'Greetings' }]);
  });
});
