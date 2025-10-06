import { jest } from '@jest/globals';

import { performInitialHandshake } from '../../src/agent/handshake.js';

const baseArgs = () => ({
  openai: {},
  model: 'test-model',
  renderPlanFn: jest.fn(),
  renderMessageFn: jest.fn(),
  renderCommandFn: jest.fn(),
  renderContextUsageFn: jest.fn(),
  runCommandFn: jest.fn(),
  runBrowseFn: jest.fn(),
  runEditFn: jest.fn(),
  runReadFn: jest.fn(),
  runReplaceFn: jest.fn(),
  runEscapeStringFn: jest.fn(),
  runUnescapeStringFn: jest.fn(),
  applyFilterFn: jest.fn(),
  tailLinesFn: jest.fn(),
  getNoHumanFlag: jest.fn(),
  setNoHumanFlag: jest.fn(),
  planReminderMessage: 'reminder',
  rl: {},
  startThinkingFn: jest.fn(),
  stopThinkingFn: jest.fn(),
  escState: {},
  approvalManager: {},
  historyCompactor: {},
  logger: { error: jest.fn() },
});

describe('performInitialHandshake', () => {
  test('invokes executePass and removes temporary prompt', async () => {
    const history = [{ role: 'system', content: 'base' }];
    const executePass = jest.fn().mockResolvedValue(undefined);

    await performInitialHandshake({
      history,
      prompt: 'HANDSHAKE_PROMPT',
      executePass,
      ...baseArgs(),
    });

    expect(executePass).toHaveBeenCalledTimes(1);
    expect(history).toHaveLength(1);
    expect(history[0].content).toBe('base');
    const arg = executePass.mock.calls[0][0];
    expect(arg.history).toBe(history);
  });

  test('logs error and clears prompt when executePass rejects', async () => {
    const history = [];
    const error = new Error('boom');
    const executePass = jest.fn().mockRejectedValue(error);
    const args = baseArgs();

    await expect(
      performInitialHandshake({
        history,
        prompt: 'PROMPT',
        executePass,
        ...args,
      }),
    ).resolves.toBeUndefined();

    expect(args.stopThinkingFn).toHaveBeenCalledTimes(1);
    expect(args.logger.error).toHaveBeenCalledTimes(2);
    expect(history).toHaveLength(0);
  });

  test('throws when history is not an array', async () => {
    await expect(
      performInitialHandshake({
        history: null,
        prompt: 'PROMPT',
        executePass: jest.fn(),
        ...baseArgs(),
      }),
    ).rejects.toThrow('Handshake requires a mutable history array');
  });

  test('throws when executePass is missing', async () => {
    await expect(
      performInitialHandshake({ history: [], prompt: 'PROMPT', executePass: null, ...baseArgs() }),
    ).rejects.toThrow('Handshake requires an executePass function');
  });
});
