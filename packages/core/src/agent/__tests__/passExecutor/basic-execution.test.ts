/* eslint-env jest */
import { jest } from '@jest/globals';
import { DEFAULT_COMMAND_MAX_BYTES } from '../../../constants.js';
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
            command: { run: 'echo hello', max_bytes: DEFAULT_COMMAND_MAX_BYTES },
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

  test('returns true when a human rejects the command so the next pass can run', async () => {
    const {
      executeAgentPass,
      parseAssistantResponse,
      executeAgentCommand,
      planHasOpenSteps,
    } = await setupPassExecutor();

    planHasOpenSteps.mockReturnValue(true);
    parseAssistantResponse.mockImplementation(() => ({
      ok: true,
      value: {
        message: 'Executing plan',
        plan: [
          {
            step: '1',
            title: 'Rejected step',
            status: 'pending',
            command: { run: 'echo nope', max_bytes: DEFAULT_COMMAND_MAX_BYTES },
          },
        ],
      },
      recovery: { strategy: 'direct' },
    }));

    const approvalManager = {
      shouldAutoApprove: jest.fn(() => ({ approved: false, source: null })),
      requestHumanDecision: jest.fn(async () => ({ decision: 'reject' as const })),
      recordSessionApproval: jest.fn(),
    };

    const context = createTestContext(3);
    context.approvalManager = approvalManager as never;

    const result = await executeAgentPass(context);

    expect(result).toBe(true);
    expect(approvalManager.requestHumanDecision).toHaveBeenCalledTimes(1);
    expect(executeAgentCommand).not.toHaveBeenCalled();
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
            command: { run: 'echo hello', max_bytes: DEFAULT_COMMAND_MAX_BYTES },
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
            command: { run: 'echo one', max_bytes: DEFAULT_COMMAND_MAX_BYTES },
          },
          {
            step: '2',
            title: 'Second task',
            status: 'pending',
            command: { run: 'echo two', max_bytes: DEFAULT_COMMAND_MAX_BYTES },
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

  test('ignores plan steps that reappear after being completed and pruned', async () => {
    const { executeAgentPass, parseAssistantResponse, executeAgentCommand, planHasOpenSteps } =
      await setupPassExecutor({
        executeAgentCommandImpl: () => ({
          result: { stdout: 'ready', stderr: '', exit_code: 0 },
          executionDetails: { code: 0 },
        }),
      });

    planHasOpenSteps.mockReturnValue(true);

    parseAssistantResponse
      .mockImplementationOnce(() => ({
        ok: true,
        value: {
          message: 'First pass plan',
          plan: [
            {
              step: '1',
              title: 'Do the work',
              status: 'pending',
              command: { run: 'echo once', max_bytes: DEFAULT_COMMAND_MAX_BYTES },
            },
          ],
        },
        recovery: { strategy: 'direct' },
      }))
      .mockImplementationOnce(() => ({
        ok: true,
        value: {
          message: 'Second pass plan',
          plan: [
            {
              step: '1',
              title: 'Do the work',
              status: 'pending',
              command: { run: 'echo once', max_bytes: DEFAULT_COMMAND_MAX_BYTES },
            },
          ],
        },
        recovery: { strategy: 'direct' },
      }))
      .mockImplementation(() => ({
        ok: true,
        value: { message: 'No plan', plan: [] },
        recovery: { strategy: 'direct' },
      }));

    const sharedHistory: unknown[] = [];

    const firstContext = { ...createTestContext(31), history: sharedHistory };
    const secondContext = { ...createTestContext(32), history: sharedHistory };

    const firstResult = await executeAgentPass(firstContext);
    const secondResult = await executeAgentPass(secondContext);

    expect(firstResult).toBe(true);
    expect(secondResult).toBe(false);
    expect(executeAgentCommand).toHaveBeenCalledTimes(1);

    const secondPlanEvents = secondContext.emitEvent.mock.calls
      .map(([event]) => event)
      .filter((event) => event && event.type === 'plan');
    expect(secondPlanEvents.length).toBeGreaterThan(0);
    const lastPlanEvent = secondPlanEvents[secondPlanEvents.length - 1];
    expect(Array.isArray(lastPlanEvent.plan)).toBe(true);
    expect(lastPlanEvent.plan).toHaveLength(0);
  });

  test('allows completed identifiers to be reused after the assistant clears the plan', async () => {
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

    parseAssistantResponse
      .mockImplementationOnce(() => ({
        ok: true,
        value: {
          message: 'Initial plan',
          plan: [
            {
              step: '1',
              title: 'Do the work',
              status: 'pending',
              command: { run: 'echo once', max_bytes: DEFAULT_COMMAND_MAX_BYTES },
            },
          ],
        },
        recovery: { strategy: 'direct' },
      }))
      .mockImplementationOnce(() => ({
        ok: true,
        value: { message: 'Plan cleared', plan: [] },
        recovery: { strategy: 'direct' },
      }))
      .mockImplementationOnce(() => ({
        ok: true,
        value: {
          message: 'Fresh plan reuse',
          plan: [
            {
              step: '1',
              title: 'Do more work',
              status: 'pending',
              command: { run: 'echo again', max_bytes: DEFAULT_COMMAND_MAX_BYTES },
            },
          ],
        },
        recovery: { strategy: 'direct' },
      }));

    const sharedHistory: unknown[] = [];

    const firstContext = { ...createTestContext(41), history: sharedHistory };
    const secondContext = { ...createTestContext(42), history: sharedHistory };
    const thirdContext = { ...createTestContext(43), history: sharedHistory };

    const firstResult = await executeAgentPass(firstContext);
    const secondResult = await executeAgentPass(secondContext);
    const thirdResult = await executeAgentPass(thirdContext);

    expect(firstResult).toBe(true);
    expect(secondResult).toBe(false);
    expect(thirdResult).toBe(true);
    expect(executeAgentCommand).toHaveBeenCalledTimes(2);
    expect(executedRuns).toEqual(['echo once', 'echo again']);

    const thirdPlanEvents = thirdContext.emitEvent.mock.calls
      .map(([event]) => event)
      .filter((event) => event && event.type === 'plan');
    expect(thirdPlanEvents.length).toBeGreaterThan(0);
    const finalPlanEvent = thirdPlanEvents[thirdPlanEvents.length - 1];
    expect(Array.isArray(finalPlanEvent.plan)).toBe(true);
    expect(finalPlanEvent.plan).toHaveLength(1);
    expect(finalPlanEvent.plan[0].status).toBe('completed');
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
            command: { run: 'echo one', max_bytes: DEFAULT_COMMAND_MAX_BYTES },
          },
          {
            id: 'b',
            title: 'Second task',
            status: 'pending',
            waitingForId: ['a'],
            command: { run: 'echo two', max_bytes: DEFAULT_COMMAND_MAX_BYTES },
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
