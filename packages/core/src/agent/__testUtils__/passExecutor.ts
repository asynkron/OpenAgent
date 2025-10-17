/* eslint-env jest */
import { jest } from '@jest/globals';
import { DEFAULT_COMMAND_MAX_BYTES } from '../../constants.js';
import type { CreateResponseResult } from '../../openai/responses.js';

// Reusable helpers that keep the main pass executor spec readable while
// preserving the original mock wiring for each dependency.
export const createPlanAutoResponseTracker = () => ({
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
});

export type PlanAutoResponseTracker = ReturnType<typeof createPlanAutoResponseTracker>;

export const createTestContext = (passIndex: number) => ({
  openai: {},
  model: 'gpt-5-codex',
  history: [] as unknown[],
  emitEvent: jest.fn(),
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
  historyCompactor: null as { compactIfNeeded?: jest.Mock } | null,
  planManager: null,
  emitAutoApproveStatus: false,
  passIndex,
  guardRequestPayloadSizeFn: undefined as jest.Mock | undefined,
  recordRequestPayloadSizeFn: undefined as jest.Mock | undefined,
  planAutoResponseTracker: undefined as PlanAutoResponseTracker | undefined,
});

export const createPlanManager = () => ({
  isMergingEnabled: jest.fn().mockReturnValue(true),
  update: jest.fn().mockImplementation(async (plan: unknown) => plan),
  get: jest.fn(),
  reset: jest.fn(),
  sync: jest.fn(),
});

type MockModelCompletion = { status: 'success'; completion: CreateResponseResult };

const createMockCompletion = (): CreateResponseResult => ({
  output_text: '',
  output: [],
  text: {} as never,
});

const createMockRequestModelCompletion = () => {
  const requestModelCompletion = jest.fn(
    async (): Promise<MockModelCompletion> => ({
      status: 'success',
      completion: createMockCompletion(),
    }),
  );
  jest.unstable_mockModule('../modelRequest.js', () => ({
    requestModelCompletion,
    default: { requestModelCompletion },
  }));
  return requestModelCompletion;
};

const createMockResponseUtils = () => {
  const mockArguments = JSON.stringify({
    message: '  ',
    plan: [
      {
        step: '1',
        title: 'Mock',
        status: 'running',
        command: { run: '   ', shell: '   ', max_bytes: DEFAULT_COMMAND_MAX_BYTES },
      },
    ],
  });

  const extractOpenAgentToolCall = jest.fn().mockReturnValue({
    name: 'open-agent',
    call_id: 'call_mock_1',
    arguments: mockArguments,
  });
  const extractResponseText = jest.fn();
  jest.unstable_mockModule('../../openai/responseUtils.js', () => ({
    extractOpenAgentToolCall,
    extractResponseText,
    default: { extractOpenAgentToolCall, extractResponseText },
  }));
  return { extractOpenAgentToolCall, extractResponseText };
};

const createMockResponseParser = () => {
  const parseAssistantResponse = jest.fn(() => ({
    ok: true,
    value: {
      message: '  ',
      plan: [
        {
          step: '1',
          title: 'Mock',
          status: 'running',
          command: { run: '   ', shell: '   ', max_bytes: DEFAULT_COMMAND_MAX_BYTES },
        },
      ],
    },
    recovery: { strategy: 'direct' },
  }));
  jest.unstable_mockModule('../responseParser.js', () => ({
    parseAssistantResponse,
    default: { parseAssistantResponse },
  }));
  return parseAssistantResponse;
};

const createMockResponseValidator = () => {
  const validateAssistantResponseSchema = jest.fn(() => ({ valid: true, errors: [] }));
  const validateAssistantResponse = jest.fn(() => ({ valid: true, errors: [] }));
  jest.unstable_mockModule('../responseValidator.js', () => ({
    validateAssistantResponseSchema,
    validateAssistantResponse,
    default: { validateAssistantResponseSchema, validateAssistantResponse },
  }));
  return { validateAssistantResponseSchema, validateAssistantResponse };
};

const createMockCommandExecution = (executeAgentCommandImpl: () => unknown) => {
  const executeAgentCommand = jest.fn(executeAgentCommandImpl);
  jest.unstable_mockModule('../commandExecution.js', () => ({
    executeAgentCommand,
    default: { executeAgentCommand },
  }));
  return executeAgentCommand;
};

const createMockUtils = () => {
  const summarizeContextUsage = jest.fn(() => null);
  jest.unstable_mockModule('../../utils/contextUsage.js', () => ({
    summarizeContextUsage,
    default: { summarizeContextUsage },
  }));

  const planHasOpenSteps = jest.fn(() => false);
  const planStepIsBlocked = jest.fn(() => false);
  const buildPlanLookup = jest.fn(() => new Map());
  jest.unstable_mockModule('../../utils/plan.js', () => ({
    planHasOpenSteps,
    planStepIsBlocked,
    buildPlanLookup,
    default: { planHasOpenSteps, planStepIsBlocked, buildPlanLookup },
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

  return {
    summarizeContextUsage,
    planHasOpenSteps,
    planStepIsBlocked,
    buildPlanLookup,
    incrementCommandCount,
    combineStdStreams,
    buildPreview,
  };
};

const createMockObservationBuilder = () => {
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
};

interface SetupPassExecutorOptions {
  executeAgentCommandImpl?: () => unknown;
}

export const setupPassExecutor = async (options: SetupPassExecutorOptions = {}) => {
  const {
    executeAgentCommandImpl = () => {
      throw new Error('executeAgentCommand should not run for blank commands');
    },
  } = options;
  jest.resetModules();

  const requestModelCompletion = createMockRequestModelCompletion();
  const { extractOpenAgentToolCall, extractResponseText } = createMockResponseUtils();
  const parseAssistantResponse = createMockResponseParser();
  const { validateAssistantResponseSchema, validateAssistantResponse } =
    createMockResponseValidator();
  const executeAgentCommand = createMockCommandExecution(executeAgentCommandImpl);
  const { summarizeContextUsage, planHasOpenSteps, planStepIsBlocked, buildPlanLookup } =
    createMockUtils();
  createMockObservationBuilder();

  const mod = await import('../passExecutor.js');
  return {
    executeAgentPass: mod.executeAgentPass,
    requestModelCompletion,
    extractOpenAgentToolCall,
    extractResponseText,
    parseAssistantResponse,
    validateAssistantResponseSchema,
    validateAssistantResponse,
    executeAgentCommand,
    summarizeContextUsage,
    planHasOpenSteps,
    planStepIsBlocked,
    buildPlanLookup,
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const createComplexPlanHasOpenStepsMock = () =>
  jest.fn((plan: unknown[] = []) =>
    Array.isArray(plan)
      ? plan.some((item) => {
          if (!isRecord(item)) {
            return false;
          }
          const rawStatus = item.status;
          const status = typeof rawStatus === 'string' ? rawStatus.trim().toLowerCase() : '';
          return status !== 'completed' && status !== 'failed' && status !== 'abandoned';
        })
      : false,
  );

export const createComplexBuildPlanLookupMock = () =>
  jest.fn((plan: unknown[] = []) => {
    const map = new Map<string, Record<string, unknown>>();
    if (!Array.isArray(plan)) {
      return map;
    }
    plan.forEach((item, index) => {
      if (!isRecord(item)) {
        return;
      }
      const rawId = item.id;
      const id =
        typeof rawId === 'string' && rawId.trim().length > 0 ? rawId.trim() : `index:${index}`;
      if (!map.has(id)) {
        map.set(id, item);
      }
    });
    return map;
  });

export const createComplexPlanStepIsBlockedMock = () =>
  jest.fn((step: unknown, planOrLookup: unknown) => {
    if (!isRecord(step)) {
      return false;
    }

    const dependencies = Array.isArray(step.waitingForId) ? step.waitingForId : [];
    if (dependencies.length === 0) {
      return false;
    }

    const lookup =
      planOrLookup instanceof Map
        ? (planOrLookup as Map<string, Record<string, unknown>>)
        : new Map<string, Record<string, unknown>>();

    if (!lookup || lookup.size === 0) {
      return true;
    }

    return dependencies.some((rawId: unknown) => {
      if (typeof rawId !== 'string' || !rawId.trim()) {
        return true;
      }

      const dependency = lookup.get(rawId.trim());
      if (!isRecord(dependency) || typeof dependency.status !== 'string') {
        return true;
      }

      const normalized = dependency.status.trim().toLowerCase();
      return normalized !== 'completed' && normalized !== 'failed';
    });
  });
