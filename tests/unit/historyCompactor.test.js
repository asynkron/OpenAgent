import { jest } from '@jest/globals';
import { HistoryCompactor } from '../../src/agent/historyCompactor.js';

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
    { role: 'system', content: 'system prompt' },
    { role: 'user', content: 'first question' },
    { role: 'assistant', content: 'first answer' },
    { role: 'user', content: 'second question' },
    { role: 'assistant', content: 'second answer' },
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
    expect(logger.log).toHaveBeenCalledWith(
      '[history-compactor] Compacted history entries.',
      {
        entriesCompacted: 2,
        originalHistoryLength: 5,
        resultingHistoryLength: 4,
      },
    );

    const [payload, options] = responsesCreate.mock.calls[0];
    expect(payload.model).toBe('test-model');
    expect(Array.isArray(payload.input)).toBe(true);
    expect(payload.input).toHaveLength(2);
    expect(payload.input[1].content).toContain('Summarize the following 2 conversation entries');
    expect(options).toBeUndefined();

    expect(history).toHaveLength(4);
    const compactedEntry = history[1];
    expect(compactedEntry.role).toBe('system');
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
