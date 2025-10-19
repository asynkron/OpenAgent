/* eslint-env jest */
import { jest } from '@jest/globals';
import type { PlanResponse } from '../../../contracts/index.js';
import {
  createNormalizedOptions,
  createObservationBuilderStub,
} from '../__testUtils__/passExecutor.js';

const loadPlanExecutor = async () => {
  jest.resetModules();

  const commandRuntimeConfig: {
    loopResults: Array<'continue' | 'command-rejected' | 'stop'>;
    execute?: jest.Mock;
    createCommandRuntime?: jest.Mock;
  } = { loopResults: [] };

  jest.unstable_mockModule('../commandRuntime.js', () => {
    const execute = jest.fn(async () => commandRuntimeConfig.loopResults.shift() ?? 'continue');
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
    instances: Array<Record<string, unknown>>;
  } = { nextExecutables: [], noExecutableResult: 'continue', instances: [] };

  jest.unstable_mockModule('../planRuntime.js', () => {
    class FakePlanRuntime {
      options: Record<string, unknown>;
      lastNoExecutableMessage?: string;
      initialize = jest.fn(async () => ({ type: 'plan-initialized', effects: [] }));
      selectNextExecutableEntry = jest.fn(() => planRuntimeConfig.nextExecutables.shift() ?? null);
      handleNoExecutable = jest.fn(async ({ parsedMessage }) => {
        this.lastNoExecutableMessage = parsedMessage;
        return planRuntimeConfig.noExecutableResult === 'continue'
          ? { type: 'continue-pending', effects: [] }
          : { type: 'stop-cleared', effects: [] };
      });
      resetPlanReminder = jest.fn();
      finalize = jest.fn(async () => ({ type: 'completed', effects: [] }));
      applyEffects = jest.fn();
      emitPlanSnapshot = jest.fn(() => ({ type: 'plan-snapshot', plan: [] }));

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

const buildResponse = (overrides: Partial<PlanResponse> = {}): PlanResponse => ({
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
    expect(planRuntimeConfig.instances[0].handleNoExecutable).toHaveBeenCalledWith({
      parsedMessage: 'hello',
    });
    expect(planRuntimeConfig.instances[0].applyEffects).toHaveBeenCalled();
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
    expect(planRuntimeConfig.instances[0].applyEffects).toHaveBeenCalled();
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
    commandRuntimeConfig.loopResults = ['command-rejected'];

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

  test('returns stop when command runtime reports cancellation', async () => {
    const { executePlan, planRuntimeConfig, commandRuntimeConfig } = await loadPlanExecutor();
    const options = createNormalizedOptions();
    planRuntimeConfig.nextExecutables = [{}];
    commandRuntimeConfig.loopResults = ['stop'];

    const outcome = await executePlan({
      parsedResponse: buildResponse({ plan: [{} as never] }),
      options,
      planManagerAdapter: null,
      observationBuilder: createObservationBuilderStub(),
      debugEmitter: { emit: jest.fn() },
    });

    expect(outcome).toBe('stop');
    expect(planRuntimeConfig.instances[0].finalize).not.toHaveBeenCalled();
    expect(commandRuntimeConfig.execute).toHaveBeenCalledTimes(1);
  });
});
