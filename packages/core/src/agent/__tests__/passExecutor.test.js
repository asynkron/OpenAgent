/* eslint-env jest */
import { jest } from '@jest/globals';

const setupPassExecutor = async (options = {}) => {
  const {
    executeAgentCommandImpl = () => {
      throw new Error('executeAgentCommand should not run for blank commands');
    },
  } = options;
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

  const executeAgentCommand = jest.fn(executeAgentCommandImpl);
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
    const PASS_INDEX = 11;
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

    expect(result).toBe(false);
    expect(requestModelCompletion).toHaveBeenCalledTimes(1);
    expect(extractOpenAgentToolCall).toHaveBeenCalledTimes(1);
    expect(parseAssistantResponse).toHaveBeenCalledTimes(1);
    expect(validateAssistantResponseSchema).toHaveBeenCalledTimes(1);
    expect(validateAssistantResponse).toHaveBeenCalledTimes(1);
    expect(executeAgentCommand).not.toHaveBeenCalled();

    expect(history.every((entry) => entry.pass === PASS_INDEX)).toBe(true);
    expect(requestModelCompletion).toHaveBeenCalledWith(
      expect.objectContaining({ passIndex: PASS_INDEX }),
    );
  });

  test('marks executing plan steps as running', async () => {
    const {
      executeAgentPass,
      parseAssistantResponse,
      executeAgentCommand,
      planHasOpenSteps,
    } = await setupPassExecutor({
      executeAgentCommandImpl: () => ({
        result: { stdout: 'ready', stderr: '', exitCode: 0 },
        executionDetails: { code: 0 },
      }),
    });

    planHasOpenSteps.mockReturnValue(true);

    // Two-step plan mirrors the real scenario where the second item never updated.
    parseAssistantResponse.mockImplementation(() => ({
      ok: true,
      value: {
        message: 'Executing plan',
        plan: [
          {
            step: '1',
            title: 'Do the work',
            status: 'pending',
            command: { run: 'echo hello' },
          },
        ],
      },
      recovery: { strategy: 'direct' },
    }));

    const emitEvent = jest.fn();
    const history = [];

    const PASS_INDEX = 5;
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
    expect(executeAgentCommand).toHaveBeenCalledTimes(1);

    const planEvents = emitEvent.mock.calls
      .map(([event]) => event)
      .filter((event) => event && event.type === 'plan');
    expect(planEvents.length).toBeGreaterThanOrEqual(3);
    expect(planEvents[0].plan[0].status).toBe('pending');
    const runningEvent = planEvents.find(
      (event) => Array.isArray(event.plan) && event.plan[0]?.status === 'running',
    );
    expect(runningEvent).toBeDefined();
    const completedEvent = planEvents.find(
      (event) => Array.isArray(event.plan) && event.plan[0]?.status === 'completed',
    );
    expect(completedEvent).toBeDefined();
  });

  test('marks plan steps as failed when command exits non-zero', async () => {
    const {
      executeAgentPass,
      parseAssistantResponse,
      executeAgentCommand,
      planHasOpenSteps,
    } = await setupPassExecutor({
      executeAgentCommandImpl: () => ({
        result: { stdout: '', stderr: 'boom', exit_code: 2 },
        executionDetails: { code: 2 },
      }),
    });

    planHasOpenSteps.mockReturnValue(true);

    parseAssistantResponse.mockImplementation(() => ({
      ok: true,
      value: {
        message: 'Executing plan',
        plan: [
          {
            step: '1',
            title: 'Failing step',
            status: 'pending',
            command: { run: 'exit 2' },
          },
        ],
      },
      recovery: { strategy: 'direct' },
    }));

    const emitEvent = jest.fn();
    const history = [];

    const PASS_INDEX = 13;
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
    expect(executeAgentCommand).toHaveBeenCalledTimes(1);

    const planEvents = emitEvent.mock.calls
      .map(([event]) => event)
      .filter((event) => event && event.type === 'plan');

    expect(planEvents.length).toBeGreaterThanOrEqual(3);
    const failedEvent = planEvents.find(
      (event) => Array.isArray(event.plan) && event.plan[0]?.status === 'failed',
    );
    expect(failedEvent).toBeDefined();
  });

  test('persists merged plans and marks successful commands as completed', async () => {
    const {
      executeAgentPass,
      parseAssistantResponse,
      executeAgentCommand,
      planHasOpenSteps,
    } = await setupPassExecutor({
      executeAgentCommandImpl: () => ({
        result: { stdout: 'ready', stderr: '', exit_code: 0 },
        executionDetails: { code: 0 },
      }),
    });

    planHasOpenSteps.mockReturnValue(true);

    parseAssistantResponse.mockImplementation(() => ({
      ok: true,
      value: {
        message: 'Executing plan',
        plan: [
          {
            step: '1',
            title: 'Do the work',
            status: 'pending',
            command: { run: 'echo hello' },
          },
        ],
      },
      recovery: { strategy: 'direct' },
    }));

    const emitEvent = jest.fn();
    const history = [];

    const syncedPlans = [];
    const planManager = {
      isMergingEnabled: jest.fn().mockReturnValue(true),
      update: jest.fn().mockImplementation(async (plan) => plan),
      get: jest.fn(),
      reset: jest.fn(),
      sync: jest.fn().mockImplementation(async function sync(plan) {
        syncedPlans.push(JSON.parse(JSON.stringify(plan)));
        return Array.isArray(plan) ? JSON.parse(JSON.stringify(plan)) : [];
      }),
    };

    const PASS_INDEX = 6;
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
      planManager,
      emitAutoApproveStatus: false,
      passIndex: PASS_INDEX,
    });

    expect(result).toBe(true);
    expect(executeAgentCommand).toHaveBeenCalledTimes(1);
    expect(planManager.update).toHaveBeenCalledTimes(1);
    expect(planManager.sync).toHaveBeenCalledTimes(2);

    const nonEmptyPlans = syncedPlans.filter((plan) => Array.isArray(plan) && plan.length > 0);
    expect(nonEmptyPlans.length).toBeGreaterThan(0);
    expect(nonEmptyPlans[nonEmptyPlans.length - 1][0].status).toBe('completed');

    const planEvents = emitEvent.mock.calls
      .map(([event]) => event)
      .filter((event) => event && event.type === 'plan');
    const finalPlanEvent = planEvents[planEvents.length - 1];
    expect(finalPlanEvent.plan[0].status).toBe('completed');
  });

  test('marks every executed plan step as completed even when later steps reorder', async () => {
    const executedRuns = [];
    const {
      executeAgentPass,
      parseAssistantResponse,
      executeAgentCommand,
      planHasOpenSteps,
    } = await setupPassExecutor({
      executeAgentCommandImpl: ({ command }) => {
        executedRuns.push(command?.run ?? '');
        return {
          result: { stdout: 'ready', stderr: '', exit_code: 0 },
          executionDetails: { code: 0 },
        };
      },
    });

    planHasOpenSteps.mockReturnValue(true);

    parseAssistantResponse.mockImplementation(() => ({
      ok: true,
      value: {
        message: 'Executing plan',
        plan: [
          {
            step: '1',
            title: 'First task',
            status: 'pending',
            command: { run: 'echo one' },
          },
          {
            step: '2',
            title: 'Second task',
            status: 'pending',
            command: { run: 'echo two' },
          },
        ],
      },
      recovery: { strategy: 'direct' },
    }));

    const emitEvent = jest.fn();
    const history = [];

    const PASS_INDEX = 21;
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
    expect(executeAgentCommand).toHaveBeenCalledTimes(2);
    expect(executedRuns).toEqual(['echo one', 'echo two']);

    const planEvents = emitEvent.mock.calls
      .map(([event]) => event)
      .filter((event) => event && event.type === 'plan');
    expect(planEvents.length).toBeGreaterThanOrEqual(3);
    const finalPlanEvent = planEvents[planEvents.length - 1];
    expect(finalPlanEvent.plan[0].status).toBe('completed');
    expect(finalPlanEvent.plan[1].status).toBe('completed');
  });

  test('re-emits plan events with persisted updates after execution finishes', async () => {
    const {
      executeAgentPass,
      parseAssistantResponse,
      executeAgentCommand,
      planHasOpenSteps,
    } = await setupPassExecutor({
      executeAgentCommandImpl: () => ({
        result: { stdout: 'oops', stderr: 'fail', exit_code: 1 },
        executionDetails: { code: 1 },
      }),
    });

    planHasOpenSteps.mockReturnValue(true);

    parseAssistantResponse.mockImplementation(() => ({
      ok: true,
      value: {
        message: 'Executing plan',
        plan: [
          {
            step: '1',
            title: 'Do the work',
            status: 'pending',
            command: { run: 'echo hello' },
          },
        ],
      },
      recovery: { strategy: 'direct' },
    }));

    const emitEvent = jest.fn();
    const history = [];

    let syncInvocations = 0;
    const planManager = {
      isMergingEnabled: jest.fn().mockReturnValue(true),
      update: jest.fn().mockImplementation(async (plan) => plan),
      get: jest.fn(),
      reset: jest.fn(),
      sync: jest.fn().mockImplementation(async function sync(plan) {
        syncInvocations += 1;
        const cloned = Array.isArray(plan) ? JSON.parse(JSON.stringify(plan)) : [];
        if (cloned[0] && syncInvocations >= 2) {
          cloned[0].status = 'completed';
          cloned[0].observation = { done: true };
        }
        return cloned;
      }),
    };

    const PASS_INDEX = 12;
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
      planManager,
      emitAutoApproveStatus: false,
      passIndex: PASS_INDEX,
    });

    expect(result).toBe(true);
    expect(executeAgentCommand).toHaveBeenCalledTimes(1);
    expect(planManager.sync).toHaveBeenCalledTimes(2);

    const planEvents = emitEvent.mock.calls
      .map(([event]) => event)
      .filter((event) => event && event.type === 'plan');

    expect(planEvents.length).toBeGreaterThanOrEqual(3);
    const lastPlanEvent = planEvents[planEvents.length - 1];
    expect(lastPlanEvent.plan[0].status).toBe('completed');
    expect(lastPlanEvent.plan[0].observation).toEqual({ done: true });
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
      role: 'assistant',
      pass: PASS_INDEX,
    });
    expect(observationEntry.payload).toEqual({
      role: 'assistant',
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

  test('clears completed plans when no steps remain open', async () => {
    const {
      executeAgentPass,
      parseAssistantResponse,
      planHasOpenSteps,
      executeAgentCommand,
    } = await setupPassExecutor();

    planHasOpenSteps.mockReturnValue(false);

    parseAssistantResponse.mockImplementation(() => ({
      ok: true,
      value: {
        message: 'Plan finished',
        plan: [
          {
            step: '1',
            title: 'Wrap up',
            status: 'completed',
          },
        ],
      },
      recovery: { strategy: 'direct' },
    }));

    const emitEvent = jest.fn();
    const history = [];
    const reset = jest.fn().mockResolvedValue([]);
    const update = jest
      .fn()
      .mockResolvedValue([{ step: '1', title: 'Wrap up', status: 'completed' }]);

    const planManager = {
      isMergingEnabled: jest.fn().mockReturnValue(true),
      update,
      get: jest.fn(),
      reset,
    };

    const PASS_INDEX = 9;
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
      planManager,
      emitAutoApproveStatus: false,
      passIndex: PASS_INDEX,
    });

    expect(result).toBe(false);
    expect(executeAgentCommand).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);

    const planEvents = emitEvent.mock.calls
      .map(([event]) => event)
      .filter((event) => event && event.type === 'plan');
    expect(planEvents.length).toBeGreaterThanOrEqual(2);
    const clearedEvent = planEvents[planEvents.length - 1];
    expect(Array.isArray(clearedEvent.plan)).toBe(true);
    expect(clearedEvent.plan).toHaveLength(0);
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

    let passIndex = 1;

    const runPass = async () => {
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
        planReminderMessage,
        startThinkingFn: jest.fn(),
        stopThinkingFn: jest.fn(),
        escState: {},
        approvalManager: null,
        historyCompactor: null,
        planManager: null,
        emitAutoApproveStatus: false,
        planAutoResponseTracker: tracker,
        passIndex,
      });

      const currentPass = passIndex;
      passIndex += 1;
      return { result, pass: currentPass };
    };

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      emitEvent.mockClear();
      const previousHistoryLength = history.length;

      const { result, pass } = await runPass();

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
      expect(autoResponseEntry).toMatchObject({
        eventType: 'chat-message',
        role: 'assistant',
        pass,
      });
      expect(autoResponseEntry.payload).toEqual({
        role: 'assistant',
        content: autoResponseEntry.content,
      });
      const parsedReminder = JSON.parse(autoResponseEntry.content);
      expect(parsedReminder).toMatchObject({ type: 'plan-reminder' });
      expect(parsedReminder.auto_response).toBe(planReminderMessage);
      expect(tracker.getCount()).toBe(attempt);

      const assistantEntry = history[history.length - 2];
      expect(assistantEntry).toMatchObject({ pass });
      expect(assistantEntry.payload).toEqual({
        role: 'assistant',
        content: assistantEntry.content,
      });
    }

    emitEvent.mockClear();
    const previousHistoryLength = history.length;

    const { result: suppressedResult, pass: suppressedPass } = await runPass();

    expect(suppressedResult).toBe(false);
    expect(emitEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'status', message: planReminderMessage }),
    );
    expect(history).toHaveLength(previousHistoryLength + 1);
    const suppressedEntry = history[history.length - 1];
    expect(suppressedEntry).toEqual(
      expect.objectContaining({
        eventType: 'chat-message',
        role: 'assistant',
        pass: suppressedPass,
      }),
    );
    expect(suppressedEntry.payload).toEqual({
      role: 'assistant',
      content: suppressedEntry.content,
    });
    expect(tracker.getCount()).toBe(4);
  });
});
