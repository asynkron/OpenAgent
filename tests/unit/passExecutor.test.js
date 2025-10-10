import { jest } from '@jest/globals';

const setupPassExecutor = async () => {
  jest.resetModules();

  const requestModelCompletion = jest
    .fn()
    .mockResolvedValue({ status: 'success', completion: { id: 'cmpl_1' } });
  jest.unstable_mockModule('../../src/agent/openaiRequest.js', () => ({
    requestModelCompletion,
    default: { requestModelCompletion },
  }));

  const extractOpenAgentToolCall = jest.fn().mockReturnValue({
    name: 'open-agent',
    call_id: 'call_mock_1',
    arguments: '{"message":"  ","command":{"run":"   ","shell":"   "}}',
  });
  const extractResponseText = jest.fn();
  jest.unstable_mockModule('../../src/openai/responseUtils.js', () => ({
    extractOpenAgentToolCall,
    extractResponseText,
    default: { extractOpenAgentToolCall, extractResponseText },
  }));

  const parseAssistantResponse = jest.fn(() => ({
    ok: true,
    value: { message: '  ', command: { run: '   ', shell: '   ' } },
    recovery: { strategy: 'direct' },
  }));
  jest.unstable_mockModule('../../src/agent/responseParser.js', () => ({
    parseAssistantResponse,
    default: { parseAssistantResponse },
  }));

  const validateAssistantResponseSchema = jest.fn(() => ({ valid: true, errors: [] }));
  const validateAssistantResponse = jest.fn(() => ({ valid: true, errors: [] }));
  jest.unstable_mockModule('../../src/agent/responseValidator.js', () => ({
    validateAssistantResponseSchema,
    validateAssistantResponse,
    default: { validateAssistantResponseSchema, validateAssistantResponse },
  }));

  const executeAgentCommand = jest.fn(() => {
    throw new Error('executeAgentCommand should not run for blank commands');
  });
  jest.unstable_mockModule('../../src/agent/commandExecution.js', () => ({
    executeAgentCommand,
    default: { executeAgentCommand },
  }));

  const summarizeContextUsage = jest.fn(() => null);
  jest.unstable_mockModule('../../src/utils/contextUsage.js', () => ({
    summarizeContextUsage,
    default: { summarizeContextUsage },
  }));

  const planHasOpenSteps = jest.fn(() => false);
  jest.unstable_mockModule('../../src/utils/plan.js', () => ({
    planHasOpenSteps,
    default: { planHasOpenSteps },
  }));

  const incrementCommandCount = jest.fn();
  jest.unstable_mockModule('../../src/services/commandStatsService.js', () => ({
    incrementCommandCount,
    default: { incrementCommandCount },
  }));

  const combineStdStreams = jest.fn();
  const buildPreview = jest.fn();
  jest.unstable_mockModule('../../src/utils/output.js', () => ({
    combineStdStreams,
    buildPreview,
    default: { combineStdStreams, buildPreview },
  }));

  class FakeObservationBuilder {
    constructor() {}
    buildCancellationObservation() {
      return {};
    }
    build() {
      return { renderPayload: '', observation: {} };
    }
  }
  jest.unstable_mockModule('../../src/agent/observationBuilder.js', () => ({
    default: FakeObservationBuilder,
  }));

  const mod = await import('../../src/agent/passExecutor.js');
  return {
    executeAgentPass: mod.executeAgentPass,
    requestModelCompletion,
    extractOpenAgentToolCall,
    parseAssistantResponse,
    validateAssistantResponseSchema,
    validateAssistantResponse,
    executeAgentCommand,
    summarizeContextUsage,
    planHasOpenSteps,
  };
};

afterEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
});

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

    const emitEvent = jest.fn();
    const history = [];

    // The mocked payload only contains whitespace for both run and shell fields.
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
    });

    expect(result).toBe(false);
    expect(requestModelCompletion).toHaveBeenCalledTimes(1);
    expect(extractOpenAgentToolCall).toHaveBeenCalledTimes(1);
    expect(parseAssistantResponse).toHaveBeenCalledTimes(1);
    expect(validateAssistantResponseSchema).toHaveBeenCalledTimes(1);
    expect(validateAssistantResponse).toHaveBeenCalledTimes(1);
    expect(executeAgentCommand).not.toHaveBeenCalled();
  });

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
      errors: [{ path: 'response.command', message: 'Must be of type object.' }],
    });

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
          expect.objectContaining({ path: 'response.command', message: 'Must be of type object.' }),
        ]),
      }),
    );

    expect(history).toHaveLength(2);
    const observationEntry = history[history.length - 1];
    expect(observationEntry.role).toBe('user');
    const observation = JSON.parse(observationEntry.content);
    expect(observation.observation_for_llm.schema_validation_error).toBe(true);
    expect(observation.observation_for_llm.details).toEqual([
      'response.command: Must be of type object.',
    ]);
  });
});
