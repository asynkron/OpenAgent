// @ts-nocheck
/* eslint-env jest */
import { jest } from '@jest/globals';

let mockCreateResponse;
let mockGetOpenAIRequestSettings;

const loadHistoryHelpers = async () => {
  const [{ createChatMessageEntry }] = await Promise.all([
    import('../historyEntry.js'),
  ]);

  return {
    createChatMessageEntry,
  };
};

async function buildBaseHistory() {
  const { createChatMessageEntry } = await loadHistoryHelpers();
  return [
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
}

beforeEach(() => {
  jest.resetModules();
  mockCreateResponse = jest.fn();
  mockGetOpenAIRequestSettings = jest.fn(() => ({ timeoutMs: null, maxRetries: null }));

  jest.unstable_mockModule('../../openai/responses.js', () => ({
    createResponse: mockCreateResponse,
  }));

  jest.unstable_mockModule('../../openai/client.js', () => ({
    getOpenAIRequestSettings: mockGetOpenAIRequestSettings,
  }));
});

describe('HistoryCompactor', () => {
  test('compacts oldest entries when usage exceeds threshold', async () => {
    mockGetOpenAIRequestSettings.mockReturnValue({ timeoutMs: null, maxRetries: 2 });
    mockCreateResponse.mockResolvedValue({
      output_text: 'Condensed summary.',
      output: [
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: 'Condensed summary.',
            },
          ],
        },
      ],
    });

    const { HistoryCompactor } = await import('../historyCompactor.js');
    const baseHistory = await buildBaseHistory();
    const history = baseHistory.map((entry) => ({ ...entry }));
    const logger = { log: jest.fn(), warn: jest.fn() };
    const openai = { responses: jest.fn(() => ({})) };

    const compactor = new HistoryCompactor({
      openai,
      model: 'test-model',
      usageThreshold: 0,
      logger,
    });

    const originalTail = history.slice(3).map((entry) => entry);

    const result = await compactor.compactIfNeeded({ history });

    expect(result).toBe(true);
    expect(mockCreateResponse).toHaveBeenCalledTimes(1);
    expect(mockCreateResponse).toHaveBeenCalledWith({
      openai,
      model: 'test-model',
      input: expect.any(Array),
      tools: undefined,
      options: { maxRetries: 2 },
      reasoningEffort: undefined,
    });
    expect(logger.log).toHaveBeenCalledWith(
      '[history-compactor] Compacted summary:\nCondensed summary.',
    );
    expect(logger.log).toHaveBeenCalledWith('[history-compactor] Compacted history entries.', {
      entriesCompacted: 2,
      originalHistoryLength: 5,
      resultingHistoryLength: 4,
    });

    expect(history).toHaveLength(4);
    const compactedEntry = history[1];
    expect(compactedEntry).toMatchObject({ eventType: 'chat-message', role: 'system', pass: 1 });
    expect(compactedEntry.payload).toEqual({ role: 'system', content: compactedEntry.content });
    expect(compactedEntry.content).toMatch(/^Compacted memory:/);
    expect(compactedEntry.content).toContain('Condensed summary.');

    expect(history.slice(2)).toEqual(originalTail);
  });

  test('skips compaction when usage ratio is not above threshold', async () => {
    mockCreateResponse.mockResolvedValue({
      output_text: 'Irrelevant summary.',
      output: [],
    });

    const { HistoryCompactor } = await import('../historyCompactor.js');
    const baseHistory = await buildBaseHistory();
    const history = baseHistory.map((entry) => ({ ...entry }));
    const openai = { responses: jest.fn(() => ({})) };

    const compactor = new HistoryCompactor({
      openai,
      model: 'test-model',
      usageThreshold: 1,
    });

    const result = await compactor.compactIfNeeded({ history });

    expect(result).toBe(false);
    expect(mockCreateResponse).not.toHaveBeenCalled();
    expect(history).toHaveLength(baseHistory.length);
  });

  test('returns false and leaves history intact when summary is empty', async () => {
    mockCreateResponse.mockResolvedValue({
      output_text: '   ',
      output: [],
    });

    const { HistoryCompactor } = await import('../historyCompactor.js');
    const baseHistory = await buildBaseHistory();
    const history = baseHistory.map((entry) => ({ ...entry }));
    const openai = { responses: jest.fn(() => ({})) };

    const compactor = new HistoryCompactor({
      openai,
      model: 'test-model',
      usageThreshold: 0,
    });

    const result = await compactor.compactIfNeeded({ history });

    expect(result).toBe(false);
    expect(mockCreateResponse).toHaveBeenCalledTimes(1);
    expect(history).toHaveLength(baseHistory.length);
    expect(history).toEqual(baseHistory);
  });
});
