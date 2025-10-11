/* eslint-env jest */
import { jest } from '@jest/globals';

const setupPassExecutor = async () => {
  jest.resetModules();

  const requestModelCompletion = jest
    .fn()
    .mockResolvedValue({ status: 'success', completion: { id: 'cmpl_1' } });
  jest.unstable_mockModule('../openaiRequest.js', () => ({
    requestModelCompletion,
    default: { requestModelCompletion },
  }));

  const extractOpenAgentToolCall = jest.fn().mockReturnValue({
    name: 'open-agent',
    call_id: 'call_mock_1',
    arguments:
      '{"message":"  ","plan":[{"step":"1","title":"Mock","status":"running","command":{"run":"   ","shell":"   "}}]}',
  });
  const extractResponseText = jest.fn();
  jest.unstable_mockModule('../../openai/responseUtils.js', () => ({
    extractOpenAgentToolCall,
    extractResponseText,
    default: { extractOpenAgentToolCall, extractResponseText },
  }));

  const parseAssistantResponse = jest.fn(() => ({
    ok: true,
    value: {
      message: '  ',
      plan: [
        {
          step: '1',
          title: 'Mock',
          status: 'running',
          command: { run: '   ', shell: '   ' },
        },
      ],
    },
    recovery: { strategy: 'direct' },
  }));
  jest.unstable_mockModule('../responseParser.js', () => ({
    parseAssistantResponse,
    default: { parseAssistantResponse },
  }));

  const validateAssistantResponseSchema = jest.fn(() => ({ valid: true, errors: [] }));
  const validateAssistantResponse = jest.fn(() => ({ valid: true, errors: [] }));
  jest.unstable_mockModule('../responseValidator.js', () => ({
    validateAssistantResponseSchema,
    validateAssistantResponse,
    default: { validateAssistantResponseSchema, validateAssistantResponse },
  }));

  const executeAgentCommand = jest.fn(() => {
    throw new Error('executeAgentCommand should not run for blank commands');
  });
  jest.unstable_mockModule('../commandExecution.js', () => ({
    executeAgentCommand,
    default: { executeAgentCommand },
  }));

  const summarizeContextUsage = jest.fn(() => null);
  jest.unstable_mockModule('../../utils/contextUsage.js', () => ({
    summarizeContextUsage,
    default: { summarizeContextUsage },
  }));

  const planHasOpenSteps = jest.fn(() => false);
  const planStepHasIncompleteChildren = jest.fn(() => false);
  jest.unstable_mockModule('../../utils/plan.js', () => ({
    planHasOpenSteps,
    planStepHasIncompleteChildren,
    default: { planHasOpenSteps, planStepHasIncompleteChildren },
  }));

  const incrementCommandCount = jest.fn();
  jest.unstable_mockModule('../../services/commandStatsService.js', () => ({
    incrementCommandCount,
    default: { incrementCommandCount },
  }));

  const combineStdStreams = jest.fn();
  const buildPreview = jest.fn();
  jest.unstable_mockModule('../../utils/output.js', () => ({
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
  jest.unstable_mockModule('../observationBuilder.js', () => ({
    default: FakeObservationBuilder,
  }));

  const mod = await import('../passExecutor.js');
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
      errors: [{ path: 'response.plan[0].command', message: 'Must be of type object.' }],
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
          expect.objectContaining({
            path: 'response.plan[0].command',
            message: 'Must be of type object.',
          }),
        ]),
      }),
    );

    expect(history).toHaveLength(2);
    const observationEntry = history[history.length - 1];
    expect(observationEntry.role).toBe('assistant');
    expect(observationEntry.content).toContain('failed schema validation');
    expect(observationEntry.content).toContain('"schema_validation_error": true');
    expect(observationEntry.content).toContain(
      '"response.plan[0].command: Must be of type object."',
    );
  });

  test('caps plan reminder auto-response after three consecutive attempts', async () => {
    const {
      executeAgentPass,
      requestModelCompletion,
      extractOpenAgentToolCall,
      parseAssistantResponse,
      validateAssistantResponseSchema,
      validateAssistantResponse,
      planHasOpenSteps,
    } = await setupPassExecutor();

    const emitEvent = jest.fn();
    const history = [];

    const planReminderMessage =
      'The plan is not completed, either send a command to continue, update the plan, take a deep breath and reanalyze the situation, add/remove steps or sub-steps, or abandon the plan if we don´t know how to continue';

    parseAssistantResponse.mockImplementation(() => ({
      ok: true,
      value: {
        message: 'Still reviewing the open plan steps.',
        plan: [
          {
            step: 'Investigate',
            title: 'Investigate',
            status: 'running',
            command: { run: '   ', shell: '   ' },
          },
        ],
      },
      recovery: { strategy: 'direct' },
    }));
    planHasOpenSteps.mockReturnValue(true);

    const tracker = {
      count: 0,
      increment() {
        this.count += 1;
        return this.count;
      },
      reset() {
        this.count = 0;
      },
      getCount() {
        return this.count;
      },
    };

    const runPass = async () =>
      executeAgentPass({
        openai: {},
        model: 'gpt-5-codex',
        history,
        emitEvent,
        runCommandFn: jest.fn(),
        applyFilterFn: jest.fn(),
        tailLinesFn: jest.fn(),
        getNoHumanFlag: () => false,
        setNoHumanFlag: () => {},
        planReminderMessage,
        startThinkingFn: jest.fn(),
        stopThinkingFn: jest.fn(),
        escState: {},
        approvalManager: null,
        historyCompactor: null,
        planManager: null,
        emitAutoApproveStatus: false,
        planAutoResponseTracker: tracker,
      });

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      emitEvent.mockClear();
      const previousHistoryLength = history.length;

      const result = await runPass();

      expect(result).toBe(true);
      expect(requestModelCompletion).toHaveBeenCalledTimes(attempt);
      expect(extractOpenAgentToolCall).toHaveBeenCalledTimes(attempt);
      expect(parseAssistantResponse).toHaveBeenCalledTimes(attempt);
      expect(validateAssistantResponseSchema).toHaveBeenCalledTimes(attempt);
      expect(validateAssistantResponse).toHaveBeenCalledTimes(attempt);

      expect(emitEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'status', level: 'warn', message: planReminderMessage }),
      );
      expect(history).toHaveLength(previousHistoryLength + 2);
      const autoResponseEntry = history[history.length - 1];
      expect(autoResponseEntry.role).toBe('assistant');
      expect(autoResponseEntry.content).toContain('Auto-response content:');
      expect(autoResponseEntry.content).toContain(planReminderMessage);
      expect(tracker.getCount()).toBe(attempt);
    }

    emitEvent.mockClear();
    const previousHistoryLength = history.length;

    const suppressedResult = await runPass();

    expect(suppressedResult).toBe(false);
    expect(emitEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'status', message: planReminderMessage }),
    );
    expect(history).toHaveLength(previousHistoryLength + 1);
    expect(history[history.length - 1]).toEqual(expect.objectContaining({ role: 'assistant' }));
    expect(tracker.getCount()).toBe(4);
  });
});
