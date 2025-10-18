/* eslint-env jest */
import { jest } from '@jest/globals';
import type ObservationBuilder from '../../observationBuilder.js';
import type { CommandResult } from '../../../commands/run.js';
import type { NormalizedExecuteAgentPassOptions } from '../types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GenericFn = (...args: any[]) => unknown;

const createMock = <T extends GenericFn>(impl?: (...args: Parameters<T>) => ReturnType<T>): T => {
  const fallback = (..._args: Parameters<T>): ReturnType<T> => undefined as ReturnType<T>;
  return jest.fn(impl ?? fallback) as unknown as T;
};

export const createObservationBuilderStub = (): ObservationBuilder =>
  ({
    build: jest.fn(),
    buildCancellationObservation: jest.fn(() => ({})),
  }) as unknown as ObservationBuilder;

export const createNormalizedOptions = (
  overrides: Partial<NormalizedExecuteAgentPassOptions> = {},
): NormalizedExecuteAgentPassOptions => ({
  openai: {} as NormalizedExecuteAgentPassOptions['openai'],
  model: 'gpt-5-codex',
  history: [],
  emitEvent: createMock<NormalizedExecuteAgentPassOptions['emitEvent']>(),
  onDebug: null,
  runCommandFn: createMock<NormalizedExecuteAgentPassOptions['runCommandFn']>(
    async () =>
      ({
        stdout: '',
        stderr: '',
        exit_code: 0,
        killed: false,
        runtime_ms: 0,
      }) satisfies CommandResult,
  ),
  applyFilterFn: createMock<NormalizedExecuteAgentPassOptions['applyFilterFn']>((text) => text),
  tailLinesFn: createMock<NormalizedExecuteAgentPassOptions['tailLinesFn']>((text) => text),
  getNoHumanFlag: () => false,
  setNoHumanFlag: jest.fn(),
  planReminderMessage: 'remember to plan',
  startThinkingFn: jest.fn(),
  stopThinkingFn: jest.fn(),
  escState: null,
  approvalManager: null,
  historyCompactor: null,
  planManager: null,
  emitAutoApproveStatus: false,
  planAutoResponseTracker: null,
  passIndex: 1,
  requestModelCompletionFn: createMock<
    NormalizedExecuteAgentPassOptions['requestModelCompletionFn']
  >(
    async () =>
      ({}) as Awaited<ReturnType<NormalizedExecuteAgentPassOptions['requestModelCompletionFn']>>,
  ),
  executeAgentCommandFn: createMock<NormalizedExecuteAgentPassOptions['executeAgentCommandFn']>(
    async () =>
      ({}) as Awaited<ReturnType<NormalizedExecuteAgentPassOptions['executeAgentCommandFn']>>,
  ),
  createObservationBuilderFn: createMock<
    NormalizedExecuteAgentPassOptions['createObservationBuilderFn']
  >(
    () =>
      ({
        build: jest.fn(),
        buildCancellationObservation: jest.fn(() => ({})),
      }) as unknown as ObservationBuilder,
  ),
  combineStdStreamsFn: createMock<NormalizedExecuteAgentPassOptions['combineStdStreamsFn']>(() => ({
    stdout: '',
    stderr: '',
  })),
  buildPreviewFn: createMock<NormalizedExecuteAgentPassOptions['buildPreviewFn']>(() => ''),
  parseAssistantResponseFn: createMock<
    NormalizedExecuteAgentPassOptions['parseAssistantResponseFn']
  >(
    () =>
      ({}) as unknown as ReturnType<NormalizedExecuteAgentPassOptions['parseAssistantResponseFn']>,
  ),
  validateAssistantResponseSchemaFn: createMock<
    NormalizedExecuteAgentPassOptions['validateAssistantResponseSchemaFn']
  >(
    () =>
      ({}) as unknown as ReturnType<
        NormalizedExecuteAgentPassOptions['validateAssistantResponseSchemaFn']
      >,
  ),
  validateAssistantResponseFn: createMock<
    NormalizedExecuteAgentPassOptions['validateAssistantResponseFn']
  >(
    () =>
      ({}) as unknown as ReturnType<
        NormalizedExecuteAgentPassOptions['validateAssistantResponseFn']
      >,
  ),
  createChatMessageEntryFn: createMock<
    NormalizedExecuteAgentPassOptions['createChatMessageEntryFn']
  >(
    (entry) =>
      ({ eventType: 'chat-message', payload: {}, ...entry }) as ReturnType<
        NormalizedExecuteAgentPassOptions['createChatMessageEntryFn']
      >,
  ),
  extractOpenAgentToolCallFn: createMock<
    NormalizedExecuteAgentPassOptions['extractOpenAgentToolCallFn']
  >(() => null),
  summarizeContextUsageFn: createMock<NormalizedExecuteAgentPassOptions['summarizeContextUsageFn']>(
    () =>
      ({}) as unknown as ReturnType<NormalizedExecuteAgentPassOptions['summarizeContextUsageFn']>,
  ),
  incrementCommandCountFn: createMock<NormalizedExecuteAgentPassOptions['incrementCommandCountFn']>(
    async () => true,
  ),
  guardRequestPayloadSizeFn: null,
  recordRequestPayloadSizeFn: null,
  ...overrides,
});
