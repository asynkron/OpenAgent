/* eslint-env jest */
import { jest } from '@jest/globals';
import type ObservationBuilder from '../../observationBuilder.js';
import type { NormalizedExecuteAgentPassOptions } from '../types.js';

export const createObservationBuilderStub = (): ObservationBuilder => ({
  build: jest.fn(),
  buildCancellationObservation: jest.fn(() => ({})),
} as unknown as ObservationBuilder);

export const createNormalizedOptions = (
  overrides: Partial<NormalizedExecuteAgentPassOptions> = {},
): NormalizedExecuteAgentPassOptions => ({
  openai: {},
  model: 'gpt-5-codex',
  history: [],
  emitEvent: jest.fn(),
  onDebug: null,
  runCommandFn: jest.fn(),
  applyFilterFn: jest.fn(),
  tailLinesFn: jest.fn(),
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
  requestModelCompletionFn: jest.fn(),
  executeAgentCommandFn: jest.fn(),
  createObservationBuilderFn: jest.fn(),
  combineStdStreamsFn: jest.fn(),
  buildPreviewFn: jest.fn(),
  parseAssistantResponseFn: jest.fn(),
  validateAssistantResponseSchemaFn: jest.fn(),
  validateAssistantResponseFn: jest.fn(),
  createChatMessageEntryFn: jest.fn(),
  extractOpenAgentToolCallFn: jest.fn(),
  summarizeContextUsageFn: jest.fn(),
  incrementCommandCountFn: jest.fn(),
  guardRequestPayloadSizeFn: null,
  recordRequestPayloadSizeFn: null,
  ...overrides,
});

describe('passExecutor test utils', () => {
  test('expose observation builder and options helpers', () => {
    expect(typeof createObservationBuilderStub).toBe('function');
    expect(typeof createNormalizedOptions).toBe('function');
  });
});
