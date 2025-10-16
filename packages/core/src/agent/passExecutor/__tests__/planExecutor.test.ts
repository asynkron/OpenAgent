/* eslint-env jest */
import { jest } from '@jest/globals';
import type { ToolResponse } from '../../../contracts/index.js';
import { createNormalizedOptions, createObservationBuilderStub } from './testUtils.js';
import type { CommandRuntimeResult } from '../commandRuntime.js';

const createSuccessResult = (): CommandRuntimeResult =>
  ({
    status: 'executed',
    approval: {
      status: 'approved',
      approvalSource: 'none',
      command: {},
      planStep: null,
      normalizedRun: '',
    },
    execution: {
      status: 'executed',
      approvalSource: 'none',
      command: {},
      planStep: null,
      normalizedRun: '',
      outcome: {
        result: {},
        executionDetails: {},
      },
    },
    stats: {
      status: 'stats-recorded',
      key: '',
      command: {},
      planStep: null,
      normalizedRun: '',
    },
    emission: {
      status: 'emitted',
      command: {},
      planStep: null,
      normalizedRun: '',
      outcome: {
        result: {},
        executionDetails: {},
      },
      observation: {},
      commandResult: {},
      preview: null,
    },
  }) as CommandRuntimeResult;

const createRejectionResult = (): CommandRuntimeResult =>
  ({
    status: 'rejected',
    command: {},
    planStep: null,
    normalizedRun: '',
    reason: 'human-declined',
  }) as CommandRuntimeResult;

const loadPlanExecutor = async () => {
  jest.resetModules();

  const commandRuntimeConfig: {
    loopResults: CommandRuntimeResult[];
    execute?: jest.Mock;
    createCommandRuntime?: jest.Mock;
  } = { loopResults: [] };

  jest.unstable_mockModule('../commandRuntime.js', () => {
    const execute = jest.fn(async () => commandRuntimeConfig.loopResults.shift() ?? createSuccessResult());
    const createCommandRuntime = jest.fn(() => ({ execute }));
    commandRuntimeConfig.execute = execute;
    commandRuntimeConfig.createCommandRuntime = createCommandRuntime;
    return {
      __esModule: true,
      createCommandRuntime,
      default: { createCommandRuntime },
    };
  });

  const planRuntimeConfig: {
    nextExecutables: unknown[];
    noExecutableResult: 'continue' | 'stop';
    instances: Array<Record<string, any>>;
  } = { nextExecutables: [], noExecutableResult: 'continue', instances: [] };

  jest.unstable_mockModule('../planRuntime.js', () => {
    class FakePlanRuntime {
      options: Record<string, unknown>;
      initialize = jest.fn(async () => {});
      selectNextExecutableEntry = jest.fn(() => planRuntimeConfig.nextExecutables.shift() ?? null);
      handleNoExecutable = jest.fn(async ({ parsedMessage }) => {
        this.lastNoExecutableMessage = parsedMessage;
        return planRuntimeConfig.noExecutableResult;
      });
      resetPlanReminder = jest.fn();
      finalize = jest.fn(async () => {});

      constructor(options: Record<string, unknown>) {
        this.options = options;
        planRuntimeConfig.instances.push(this);
      }
    }

    return {
      __esModule: true,
      PlanRuntime: FakePlanRuntime,
    };
  });

  const module = await import('../planExecutor.js');
  return { ...module, commandRuntimeConfig, planRuntimeConfig };
};

const buildResponse = (overrides: Partial<ToolResponse> = {}): ToolResponse => ({
  message: 'hello',
  plan: [],
  commands: [],
  observations: [],
  ...overrides,
});

describe('executePlan', () => {
  test('returns no-executable when the plan has no steps', async () => {
    const { executePlan, planRuntimeConfig } = await loadPlanExecutor();
    const options = createNormalizedOptions();

    const outcome = await executePlan({
      parsedResponse: buildResponse(),
      options,
      planManagerAdapter: null,
      observationBuilder: createObservationBuilderStub(),
      debugEmitter: { emit: jest.fn() },
    });

    expect(outcome).toBe('no-executable');
    expect(planRuntimeConfig.instances[0].handleNoExecutable).toHaveBeenCalledWith({ parsedMessage: 'hello' });
  });

  test('returns stop when no executable steps remain and runtime halts', async () => {
    const { executePlan, planRuntimeConfig } = await loadPlanExecutor();
    const options = createNormalizedOptions();
    planRuntimeConfig.noExecutableResult = 'stop';

    const outcome = await executePlan({
      parsedResponse: buildResponse({ message: 'done' }),
      options,
      planManagerAdapter: null,
      observationBuilder: createObservationBuilderStub(),
      debugEmitter: { emit: jest.fn() },
    });

    expect(outcome).toBe('stop');
  });

  test('executes commands while toggling thinking state', async () => {
    const { executePlan, planRuntimeConfig, commandRuntimeConfig } = await loadPlanExecutor();
    const options = createNormalizedOptions();
    planRuntimeConfig.nextExecutables = [{}];
    commandRuntimeConfig.loopResults = ['continue'];

    const outcome = await executePlan({
      parsedResponse: buildResponse({ plan: [{} as never] }),
      options,
      planManagerAdapter: null,
      observationBuilder: createObservationBuilderStub(),
      debugEmitter: { emit: jest.fn() },
    });

    expect(outcome).toBe('continue');
    expect(options.startThinkingFn).toHaveBeenCalled();
    expect(options.stopThinkingFn).toHaveBeenCalled();
    expect(commandRuntimeConfig.createCommandRuntime).toHaveBeenCalled();
    expect(commandRuntimeConfig.execute).toHaveBeenCalled();
    expect(planRuntimeConfig.instances[0].finalize).toHaveBeenCalled();
  });

  test('returns command-rejected when approval halts execution', async () => {
    const { executePlan, planRuntimeConfig, commandRuntimeConfig } = await loadPlanExecutor();
    const options = createNormalizedOptions();
    planRuntimeConfig.nextExecutables = [{}];
    commandRuntimeConfig.loopResults = [createRejectionResult()];

    const outcome = await executePlan({
      parsedResponse: buildResponse({ plan: [{} as never] }),
      options,
      planManagerAdapter: null,
      observationBuilder: createObservationBuilderStub(),
      debugEmitter: { emit: jest.fn() },
    });

    expect(outcome).toBe('command-rejected');
    expect(planRuntimeConfig.instances[0].finalize).not.toHaveBeenCalled();
  });
});
