/* eslint-env jest */
import { jest } from '@jest/globals';
import { HistoryCompactor } from '../historyCompactor.js';
import { createChatMessageEntry } from '../historyEntry.js';

function createOpenAIMock({ summaryText }) {
  const responsesCreate = jest.fn().mockResolvedValue({
    output: [
      {
        type: 'message',
        content: [
          {
            type: 'output_text',
            text: summaryText,
          },
        ],
      },
    ],
  });

  return {
    client: {
      responses: {
        create: responsesCreate,
      },
    },
    responsesCreate,
  };
}

describe('HistoryCompactor', () => {
  const baseHistory = [
    createChatMessageEntry({
      eventType: 'chat-message',
      role: 'system',
      content: 'system prompt',
      pass: 0,
    }),
    createChatMessageEntry({
      eventType: 'chat-message',
      role: 'user',
      content: 'first question',
      pass: 1,
    }),
    createChatMessageEntry({
      eventType: 'chat-message',
      role: 'assistant',
      content: 'first answer',
      pass: 1,
    }),
    createChatMessageEntry({
      eventType: 'chat-message',
      role: 'user',
      content: 'second question',
      pass: 2,
    }),
    createChatMessageEntry({
      eventType: 'chat-message',
      role: 'assistant',
      content: 'second answer',
      pass: 2,
    }),
  ];

  test('compacts oldest entries when usage exceeds threshold', async () => {
    const history = baseHistory.map((entry) => ({ ...entry }));
    const { client, responsesCreate } = createOpenAIMock({ summaryText: 'Condensed summary.' });

    const logger = { log: jest.fn(), warn: jest.fn() };
    const compactor = new HistoryCompactor({
      openai: client,
      model: 'test-model',
      usageThreshold: 0,
      logger,
    });

    const originalTail = history.slice(3).map((entry) => entry);

    const result = await compactor.compactIfNeeded({ history });

    expect(result).toBe(true);
    expect(responsesCreate).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenCalledWith(
      '[history-compactor] Compacted summary:\nCondensed summary.',
    );
    expect(logger.log).toHaveBeenCalledWith('[history-compactor] Compacted history entries.', {
      entriesCompacted: 2,
      originalHistoryLength: 5,
      resultingHistoryLength: 4,
    });

    const [payload, options] = responsesCreate.mock.calls[0];
    expect(payload.model).toBe('test-model');
    expect(Array.isArray(payload.input)).toBe(true);
    expect(payload.input).toHaveLength(2);
    expect(payload.input[1].content).toContain('Summarize the following 2 conversation entries');
    expect(payload.input[0]).toEqual({
      role: 'system',
      content:
        'You summarize prior conversation history into a concise long-term memory for an autonomous agent. Capture key facts, decisions, obligations, and user preferences. Respond with plain text only.',
    });
    expect(options).toBeUndefined();

    expect(history).toHaveLength(4);
    const compactedEntry = history[1];
    expect(compactedEntry).toMatchObject({ eventType: 'chat-message', role: 'system', pass: 1 });
    expect(compactedEntry.payload).toEqual({ role: 'system', content: compactedEntry.content });
    expect(compactedEntry.content).toMatch(/^Compacted memory:/);
    expect(compactedEntry.content).toContain('Condensed summary.');

    expect(history.slice(2)).toEqual(originalTail);
  });

  test('skips compaction when usage ratio is not above threshold', async () => {
    const history = baseHistory.map((entry) => ({ ...entry }));
    const { client, responsesCreate } = createOpenAIMock({ summaryText: 'Irrelevant summary.' });

    const compactor = new HistoryCompactor({
      openai: client,
      model: 'test-model',
      usageThreshold: 1,
    });

    const result = await compactor.compactIfNeeded({ history });

    expect(result).toBe(false);
    expect(responsesCreate).not.toHaveBeenCalled();
    expect(history).toHaveLength(baseHistory.length);
    expect(history).toEqual(baseHistory);
  });

  test('returns false and leaves history intact when summary is empty', async () => {
    const history = baseHistory.map((entry) => ({ ...entry }));
    const { client, responsesCreate } = createOpenAIMock({ summaryText: '   ' });

    const compactor = new HistoryCompactor({
      openai: client,
      model: 'test-model',
      usageThreshold: 0,
    });

    const result = await compactor.compactIfNeeded({ history });

    expect(result).toBe(false);
    expect(responsesCreate).toHaveBeenCalledTimes(1);
    expect(history).toHaveLength(baseHistory.length);
    expect(history).toEqual(baseHistory);
  });
});
