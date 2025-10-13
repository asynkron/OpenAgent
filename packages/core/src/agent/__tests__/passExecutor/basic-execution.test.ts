/* eslint-env jest */
import { jest } from '@jest/globals';
import * as H from './helpers';
Object.assign(globalThis, H);

describe('executeAgentPass', () => {
  test('marks executing plan steps as running', async () => {
    const { executeAgentPass, parseAssistantResponse, executeAgentCommand, planHasOpenSteps } =
      await setupPassExecutor({
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

    const PASS_INDEX = 5;
    const context = createTestContext(PASS_INDEX);
    const result = await executeAgentPass(context);

    expect(result).toBe(true);
    expect(executeAgentCommand).toHaveBeenCalledTimes(1);

    const planEvents = context.emitEvent.mock.calls
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

  test('merges incoming plans and marks successful commands as completed', async () => {
    const { executeAgentPass, parseAssistantResponse, executeAgentCommand, planHasOpenSteps } =
      await setupPassExecutor({
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

    const planManager = {
      isMergingEnabled: jest.fn().mockReturnValue(true),
      update: jest.fn().mockImplementation(async (plan) => plan),
      get: jest.fn(),
      reset: jest.fn(),
      sync: jest.fn(),
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

    const planEvents = emitEvent.mock.calls
      .map(([event]) => event)
      .filter((event) => event && event.type === 'plan');
    const finalPlanEvent = planEvents[planEvents.length - 1];
    expect(finalPlanEvent.plan[0].status).toBe('completed');
  });

  test('marks every executed plan step as completed even when later steps reorder', async () => {
    const executedRuns = [];
    const { executeAgentPass, parseAssistantResponse, executeAgentCommand, planHasOpenSteps } =
      await setupPassExecutor({
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
