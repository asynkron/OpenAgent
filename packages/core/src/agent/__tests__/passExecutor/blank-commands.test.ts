/* eslint-env jest */
import { jest } from '@jest/globals';
import * as H from './helpers';
Object.assign(globalThis, H);

describe('executeAgentPass', () => {
  test('treats commands with blank run/shell fields as missing', async () => {
    const {
      executeAgentPass,
      requestModelCompletion,
      extractOpenAgentToolCall,
      parseAssistantResponse,
      validateAssistantResponseSchema,
      validateAssistantResponse,
      executeAgentCommand,
    } = await setupPassExecutor();

    const PASS_INDEX = 11;
    const context = createTestContext(PASS_INDEX);
    const result = await executeAgentPass(context);

    expect(result).toBe(false);
    expect(requestModelCompletion).toHaveBeenCalledTimes(1);
    expect(extractOpenAgentToolCall).toHaveBeenCalledTimes(1);
    expect(parseAssistantResponse).toHaveBeenCalledTimes(1);
    expect(validateAssistantResponseSchema).toHaveBeenCalledTimes(1);
    expect(validateAssistantResponse).toHaveBeenCalledTimes(1);
    expect(executeAgentCommand).not.toHaveBeenCalled();

    expect(context.history.every((entry) => entry.pass === PASS_INDEX)).toBe(true);
    expect(requestModelCompletion).toHaveBeenCalledWith(
      expect.objectContaining({ passIndex: PASS_INDEX }),
    );
  });
});
