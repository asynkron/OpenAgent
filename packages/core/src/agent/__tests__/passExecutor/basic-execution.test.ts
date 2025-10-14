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
    const finalPlanEvent = planEvents[planEvents.length - 1];
    expect(Array.isArray(finalPlanEvent.plan)).toBe(true);
    expect(finalPlanEvent.plan).toHaveLength(1);
    expect(finalPlanEvent.plan[0].status).toBe('completed');
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
    expect(Array.isArray(finalPlanEvent.plan)).toBe(true);
    expect(finalPlanEvent.plan).toHaveLength(1);
    expect(finalPlanEvent.plan[0].status).toBe('completed');
  });

  test('keeps completed plan steps until the next assistant response even when later steps reorder', async () => {
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
    expect(Array.isArray(finalPlanEvent.plan)).toBe(true);
    expect(finalPlanEvent.plan).toHaveLength(2);
    expect(finalPlanEvent.plan.map((step) => step.status)).toEqual(['completed', 'completed']);
  });

  test('executes dependent plan steps after prerequisites complete', async () => {
    const executedRuns: string[] = [];
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
        message: 'Executing dependent plan',
        plan: [
          {
            id: 'a',
            title: 'First task',
            status: 'pending',
            command: { run: 'echo one' },
          },
          {
            id: 'b',
            title: 'Second task',
            status: 'pending',
            waitingForId: ['a'],
            command: { run: 'echo two' },
          },
        ],
      },
      recovery: { strategy: 'direct' },
    }));

    const emitEvent = jest.fn();
    const history: unknown[] = [];

    const PASS_INDEX = 34;
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

    const dependentReadyEvent = planEvents.find((event) => {
      if (!Array.isArray(event.plan)) {
        return false;
      }

      const prerequisiteCompleted = event.plan.some(
        (step) => step?.id === 'a' && step?.status === 'completed',
      );
      const dependentReady = event.plan.some((step) => {
        if (step?.id !== 'b') {
          return false;
        }

        const dependencies = Array.isArray(step.waitingForId) ? step.waitingForId : [];
        return dependencies.length === 0;
      });

      return prerequisiteCompleted && dependentReady;
    });
    expect(dependentReadyEvent).toBeDefined();

    const finalPlanEvent = planEvents[planEvents.length - 1];
    expect(Array.isArray(finalPlanEvent.plan)).toBe(true);
    expect(finalPlanEvent.plan).toHaveLength(2);
    expect(finalPlanEvent.plan.map((step) => step.status)).toEqual(['completed', 'completed']);
  });
});
