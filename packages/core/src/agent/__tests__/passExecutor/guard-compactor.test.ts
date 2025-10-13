/* eslint-env jest */
import { jest } from '@jest/globals';
import * as H from './helpers';
Object.assign(globalThis, H);

describe('executeAgentPass', () => {
  test('invokes payload guard before attempting history compaction', async () => {
    const { executeAgentPass, requestModelCompletion } = await setupPassExecutor();

    requestModelCompletion.mockResolvedValueOnce({ status: 'canceled' });

    const callOrder: string[] = [];
    const guardRequestPayloadSizeFn = jest.fn(async () => {
      callOrder.push('guard');
    });
    const compactIfNeeded = jest.fn(async () => {
      callOrder.push('compactor');
    });

    const PASS_INDEX = 7;
    const context = createTestContext(PASS_INDEX);
    context.historyCompactor = { compactIfNeeded };
    context.guardRequestPayloadSizeFn = guardRequestPayloadSizeFn;

    await executeAgentPass(context);

    expect(guardRequestPayloadSizeFn).toHaveBeenCalledTimes(1);
    expect(guardRequestPayloadSizeFn).toHaveBeenCalledWith({
      history: context.history,
      model: 'gpt-5-codex',
      passIndex: PASS_INDEX,
    });
    expect(compactIfNeeded).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(['guard', 'compactor']);
  });
});
