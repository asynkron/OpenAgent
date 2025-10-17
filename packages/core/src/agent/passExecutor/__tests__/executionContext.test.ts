/* eslint-env jest */
import { jest } from '@jest/globals';
import { createExecutionContext } from '../executionContext.js';
import type { EmitEvent } from '../types.js';

const createEmitEventMock = (): jest.MockedFunction<EmitEvent> =>
  jest.fn<ReturnType<EmitEvent>, Parameters<EmitEvent>>();

const createOptions = (overrides: Partial<Parameters<typeof createExecutionContext>[0]> = {}) => ({
  openai: {},
  model: 'gpt-5-codex',
  history: [],
  emitEvent: createEmitEventMock(),
  runCommandFn: jest.fn(),
  applyFilterFn: jest.fn(),
  tailLinesFn: jest.fn(),
  planReminderMessage: 'plan reminder',
  startThinkingFn: jest.fn(),
  stopThinkingFn: jest.fn(),
  escState: null,
  approvalManager: null,
  historyCompactor: null,
  planManager: null,
  passIndex: 3,
  ...overrides,
});

describe('createExecutionContext', () => {
  test('materializes observation builder with provided factory', () => {
    const createObservationBuilderFn = jest.fn(() => ({}) as unknown);
    const options = createOptions({ createObservationBuilderFn });

    const context = createExecutionContext(options);

    expect(createObservationBuilderFn).toHaveBeenCalledWith({
      applyFilter: options.applyFilterFn,
      buildPreview: expect.any(Function),
      combineStdStreams: expect.any(Function),
      tailLines: options.tailLinesFn,
    });
    expect(context.observationBuilder).toBeDefined();
    expect(context.debugEmitter).toBeDefined();
  });

  test('records payload baseline when finalizePass resolves', async () => {
    const recordRequestPayloadSizeFn = jest.fn(async () => {});
    const options = createOptions({ recordRequestPayloadSizeFn });

    const context = createExecutionContext(options);
    const result = await context.finalizePass(true);

    expect(result).toBe(true);
    expect(recordRequestPayloadSizeFn).toHaveBeenCalledWith({
      history: options.history,
      model: options.model,
      passIndex: options.passIndex,
    });
  });

  test('emits warning when baseline recording fails', async () => {
    const recordRequestPayloadSizeFn = jest.fn(async () => {
      throw new Error('boom');
    });
    const emitEvent = createEmitEventMock();
    const options = createOptions({ recordRequestPayloadSizeFn, emitEvent });

    const context = createExecutionContext(options);
    await context.recordLatestBaseline();

    expect(emitEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'status',
        level: 'warn',
      }),
    );
  });

  test('throws when passIndex is missing', () => {
    expect(() =>
      createExecutionContext({
        ...createOptions(),
        passIndex: undefined as unknown as number,
      }),
    ).toThrow('executeAgentPass requires a numeric passIndex.');
  });
});
