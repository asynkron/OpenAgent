/* eslint-env jest */
import { jest } from '@jest/globals';
import * as H from './helpers';
Object.assign(globalThis, H);

describe('executeAgentPass', () => {
  test('auto-responds when schema validation fails', async () => {
    const {
      executeAgentPass,
      requestModelCompletion,
      extractOpenAgentToolCall,
      parseAssistantResponse,
      validateAssistantResponseSchema,
      validateAssistantResponse,
    } = await setupPassExecutor();

    const emitEvent = jest.fn();
    const history = [];

    validateAssistantResponseSchema.mockReturnValue({
      valid: false,
      errors: [{ path: 'response.plan[0].command', message: 'Must be of type object.' }],
    });

    const PASS_INDEX = 7;
    const result = await executeAgentPass({
      openai: {},
      model: 'gpt-5-codex',
      history,
      emitEvent,
      runCommandFn: jest.fn(),
      applyFilterFn: jest.fn(),
      tailLinesFn: jest.fn(),
      getNoHumanFlag: () => false,
      setNoHumanFlag: () => {},
      planReminderMessage: 'remember the plan',
      startThinkingFn: jest.fn(),
      stopThinkingFn: jest.fn(),
      escState: {},
      approvalManager: null,
      historyCompactor: null,
      planManager: null,
      emitAutoApproveStatus: false,
      passIndex: PASS_INDEX,
    });

    expect(result).toBe(true);
    expect(requestModelCompletion).toHaveBeenCalledTimes(1);
    expect(extractOpenAgentToolCall).toHaveBeenCalledTimes(1);
    expect(parseAssistantResponse).toHaveBeenCalledTimes(1);
    expect(validateAssistantResponseSchema).toHaveBeenCalledTimes(1);
    expect(validateAssistantResponse).not.toHaveBeenCalled();

    expect(emitEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'schema_validation_failed',
        errors: expect.arrayContaining([
          expect.objectContaining({
            path: 'response.plan[0].command',
            message: 'Must be of type object.',
          }),
        ]),
      }),
    );

    expect(history).toHaveLength(2);
    const observationEntry = history[history.length - 1];
    expect(observationEntry).toMatchObject({
      eventType: 'chat-message',
      role: 'user',
      pass: PASS_INDEX,
    });
    expect(observationEntry.payload).toEqual({
      role: 'user',
      content: observationEntry.content,
    });
    const assistantEntry = history[0];
    expect(assistantEntry).toMatchObject({ pass: PASS_INDEX });
    expect(assistantEntry.payload).toEqual({
      role: 'assistant',
      content: assistantEntry.content,
    });
    const parsedObservation = JSON.parse(observationEntry.content);
    expect(parsedObservation).toMatchObject({
      type: 'observation',
      summary: 'The previous assistant response failed schema validation.',
    });
    expect(parsedObservation.details).toContain('Schema validation failed');
    expect(parsedObservation.payload).toMatchObject({ schema_validation_error: true });
    expect(parsedObservation.payload.details).toContain(
      'response.plan[0].command: Must be of type object.',
    );
  });
});
